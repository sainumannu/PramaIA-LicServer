; ============================================================================
; PramaIA Licensing Server - Inno Setup Installer Script
; ============================================================================
; Genera un installer Windows per la distribuzione on-premise.
; Richiede Inno Setup 6: https://jrsoftware.org/isdl.php
;
; Utilizzo consigliato (dalla radice del repo):
;   .\installer\build-release.ps1 -Version "1.0.0"
;
; Utilizzo manuale (dopo aver popolato installer\release):
;   "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" /DMyAppVersion=1.0.0 installer.iss
;
; Installazione silenziosa (i valori mancanti usano i default):
;   PramaIA-LicServer-Setup-1.0.0.exe /VERYSILENT /SUPPRESSMSGBOXES /NORESTART ^
;     /MODE=portal /PORT=8030 /PORTALURL=http://portal:3080 ^
;     /PORTALAPIURL=http://portal:8091 /JWTSECRET=... /TASKS="installservice,firewall"
; ============================================================================

#ifndef MyAppVersion
  #define MyAppVersion "1.0.0"
#endif
#define MyAppName      "PramaIA Licensing Server"
#define MyAppPublisher "PramaIA Platform"
#define MyAppURL       "https://pramaia.ai"
#define MyAppExeName   "PramaIA-LicServer.exe"
#define MyServiceName  "PramaIA-LicServer"
#define MyFirewallRule "PramaIA Licensing Server"
#define ReleaseDir     "release"

[Setup]
AppId={{DA14042E-52D1-4D6B-AE7D-34C68BBDDE88}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
DefaultDirName={autopf}\PramaIA\LicServer
DefaultGroupName=PramaIA
DisableDirPage=no
AllowNoIcons=yes
OutputDir=output
OutputBaseFilename=PramaIA-LicServer-Setup-{#MyAppVersion}
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0
UninstallDisplayName={#MyAppName}
CloseApplications=yes
RestartApplications=no

[Languages]
Name: "italian"; MessagesFile: "compiler:Languages\Italian.isl"

[Tasks]
Name: "installservice";   Description: "Installa come servizio Windows (avvio automatico)";           GroupDescription: "Servizio Windows:"
Name: "firewall";         Description: "Consenti la porta in ingresso nel Windows Firewall";          GroupDescription: "Rete:"; Flags: unchecked
Name: "desktopicon";      Description: "Crea icona sul Desktop";                                       GroupDescription: "Icone aggiuntive:"; Flags: unchecked

[InstallDelete]
; La build React ha file con hash nel nome: senza pulizia gli aggiornamenti accumulano file orfani.
Type: filesandordirs; Name: "{app}\frontend"

[Files]
; --- nssm.exe (Windows Service wrapper) ---
Source: "{#ReleaseDir}\nssm.exe";                DestDir: "{app}";           Flags: ignoreversion

; --- Backend compilato + frontend (obbligatori: se mancano la compilazione fallisce) ---
Source: "{#ReleaseDir}\{#MyAppExeName}";        DestDir: "{app}";           Flags: ignoreversion
Source: "{#ReleaseDir}\frontend\*";             DestDir: "{app}\frontend";  Flags: ignoreversion recursesubdirs createallsubdirs

; --- Documentazione e script di avvio manuale ---
Source: "{#ReleaseDir}\INSTALLER_README.md";    DestDir: "{app}";           Flags: ignoreversion skipifsourcedoesntexist
Source: "{#ReleaseDir}\README.md";              DestDir: "{app}";           Flags: ignoreversion skipifsourcedoesntexist
Source: "{#ReleaseDir}\start-service.cmd";      DestDir: "{app}";           Flags: ignoreversion

; NB: .env NON e' un file dell'installer: viene generato in [Code] solo alla prima installazione,
; cosi' un aggiornamento non sovrascrive mai la configurazione esistente.

[Dirs]
; Dati persistenti: database SQLite e chiavi RSA di firma (data\keys). Mai rimossi dalla disinstallazione:
; perdere la chiave privata invalida tutte le licenze gia' emesse.
Name: "{app}\data";        Flags: uninsneveruninstall
Name: "{app}\logs";        Flags: uninsneveruninstall

[INI]
Filename: "{app}\PramaIA-LicServer.url"; Section: "InternetShortcut"; Key: "URL"; String: "http://localhost:{code:GetBackendPort}/"

[Icons]
Name: "{group}\{#MyAppName}";         Filename: "{app}\PramaIA-LicServer.url"
Name: "{group}\Disinstalla";           Filename: "{uninstallexe}"
Name: "{commondesktop}\{#MyAppName}"; Filename: "{app}\PramaIA-LicServer.url"; Tasks: desktopicon

[Run]
; NOTA: il servizio viene installato/avviato in [Code] (CurStepChanged/ssPostInstall), dopo la creazione di .env.
; NON avviare start-service.cmd se e' gia' installato come servizio
; (doppio processo sulla stessa porta -> WinError 10048). Solo se NON si e' scelto il servizio.
Filename: "{app}\PramaIA-LicServer.url"; Description: "Apri {#MyAppName} nel browser"; Flags: shellexec postinstall skipifsilent unchecked
Filename: "cmd.exe"; Parameters: "/c ""{app}\start-service.cmd"""; Description: "Avvia {#MyAppName} (solo se NON installato come servizio)"; Tasks: not installservice; Flags: nowait postinstall skipifsilent unchecked

[UninstallRun]
; Disinstalla il servizio Windows e la regola firewall se presenti
Filename: "{app}\nssm.exe"; Parameters: "stop {#MyServiceName}"; Flags: runhidden; RunOnceId: "StopService"
Filename: "{app}\nssm.exe"; Parameters: "remove {#MyServiceName} confirm"; Flags: runhidden; RunOnceId: "RemoveService"
Filename: "{sys}\netsh.exe"; Parameters: "advfirewall firewall delete rule name=""{#MyFirewallRule}"""; Flags: runhidden; RunOnceId: "RemoveFirewallRule"

[UninstallDelete]
Type: files; Name: "{app}\PramaIA-LicServer.url"

[Code]
const
  SID_SYSTEM = '*S-1-5-18';
  SID_ADMINS = '*S-1-5-32-544';
  NL = #13#10;

var
  ModePage: TInputOptionWizardPage;
  ConfigPage: TInputQueryWizardPage;

{ ---------------------------------------------------------------------------
  Utility
  --------------------------------------------------------------------------- }

function EnvPath: String;
begin
  Result := AddBackslash(WizardDirValue) + '.env';
end;

{ Legge un valore da un .env esistente (KEY=value); Default se assente. }
function ReadEnvValue(const Key, Default: String): String;
var
  Lines: TArrayOfString;
  I, P: Integer;
  Line: String;
begin
  Result := Default;
  if not LoadStringsFromFile(EnvPath, Lines) then Exit;
  for I := 0 to GetArrayLength(Lines) - 1 do
  begin
    Line := Trim(Lines[I]);
    if (Length(Line) > Length(Key)) and (Copy(Line, 1, Length(Key) + 1) = Key + '=') then
    begin
      P := Length(Key) + 2;
      Result := Trim(Copy(Line, P, Length(Line) - P + 1));
      Exit;
    end;
  end;
end;

function IsPortalMode: Boolean;
begin
  Result := ModePage.SelectedValueIndex = 1;
end;

{ Usata da [INI] e dal firewall: porta scelta nel wizard, o quella del .env esistente in caso di upgrade. }
function GetBackendPort(Param: String): String;
begin
  if FileExists(EnvPath) then
    Result := ReadEnvValue('BACKEND_PORT', '8030')
  else
    Result := Trim(ConfigPage.Values[0]);
  if Result = '' then Result := '8030';
end;

function RunHidden(const Exe, Params: String): Integer;
var
  ResultCode: Integer;
begin
  if not Exec(Exe, Params, '', SW_HIDE, ewWaitUntilTerminated, ResultCode) then
    ResultCode := -1;
  Log(Format('Exec: %s %s -> %d', [Exe, Params, ResultCode]));
  Result := ResultCode;
end;

function Nssm(const Params: String): Integer;
begin
  Result := RunHidden(ExpandConstant('{app}\nssm.exe'), Params);
end;

{ ---------------------------------------------------------------------------
  Wizard: modalita' e parametri (solo alla prima installazione)
  --------------------------------------------------------------------------- }

procedure InitializeWizard;
begin
  ModePage := CreateInputOptionPage(wpSelectTasks,
    'Modalita'' di funzionamento',
    'Come deve essere autenticato l''accesso?',
    'Scegli la modalita'' di funzionamento del server. Potrai cambiarla in seguito modificando il file .env.',
    True, False);
  ModePage.Add('Standalone: nessun login, accesso solo da questa macchina (127.0.0.1)');
  ModePage.Add('Integrato con PramaIA Portal (SSO): accessibile in rete, login tramite Portal');
  if CompareText(ExpandConstant('{param:MODE|standalone}'), 'portal') = 0 then
    ModePage.SelectedValueIndex := 1
  else
    ModePage.SelectedValueIndex := 0;

  ConfigPage := CreateInputQueryPage(ModePage.ID,
    'Configurazione del server',
    'Porta di ascolto e parametri del Portal',
    'I campi relativi al Portal sono obbligatori solo in modalita'' "Integrato con PramaIA Portal" e vengono ignorati in modalita'' Standalone.');
  ConfigPage.Add('Porta del server:', False);
  ConfigPage.Add('URL del Portal (redirect di login):', False);
  ConfigPage.Add('URL API del Portal (chiamate backend-to-backend):', False);
  ConfigPage.Add('PRAMAIA_JWT_SECRET (identico a quello del Portal):', True);
  ConfigPage.Values[0] := ExpandConstant('{param:PORT|8030}');
  ConfigPage.Values[1] := ExpandConstant('{param:PORTALURL|http://localhost:3080}');
  ConfigPage.Values[2] := ExpandConstant('{param:PORTALAPIURL|http://localhost:8091}');
  ConfigPage.Values[3] := ExpandConstant('{param:JWTSECRET|}');
end;

{ In caso di aggiornamento il .env esiste gia' e viene preservato: le pagine di configurazione non servono. }
function ShouldSkipPage(PageID: Integer): Boolean;
begin
  Result := False;
  if (PageID = ModePage.ID) or (PageID = ConfigPage.ID) then
    Result := FileExists(EnvPath);
end;

function NextButtonClick(CurPageID: Integer): Boolean;
var
  Port: Integer;
begin
  Result := True;
  if CurPageID = ConfigPage.ID then
  begin
    Port := StrToIntDef(Trim(ConfigPage.Values[0]), 0);
    if (Port < 1) or (Port > 65535) then
    begin
      MsgBox('La porta deve essere un numero tra 1 e 65535.', mbError, MB_OK);
      Result := False;
    end
    else if IsPortalMode and (Trim(ConfigPage.Values[3]) = '') then
    begin
      MsgBox('In modalita'' Portal il PRAMAIA_JWT_SECRET e'' obbligatorio: deve coincidere con quello del Portal.', mbError, MB_OK);
      Result := False;
    end
    else if (Pos('''', ConfigPage.Values[3]) > 0) or (Pos(#13, ConfigPage.Values[3]) > 0) or (Pos(#10, ConfigPage.Values[3]) > 0) then
    begin
      MsgBox('Il PRAMAIA_JWT_SECRET non puo'' contenere apici singoli o a capo.', mbError, MB_OK);
      Result := False;
    end;
  end;
end;

{ ---------------------------------------------------------------------------
  CRITICAL: stop del servizio + kill dei processi PRIMA della copia file.
  La sezione Run e' troppo tardi: exe e nssm.exe resterebbero bloccati (file in uso).
  --------------------------------------------------------------------------- }
function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  ResultCode: Integer;
begin
  Result := '';
  NeedsRestart := False;

  { Validazione anche per le installazioni silenziose (dove le pagine non vengono mostrate) }
  if (not FileExists(EnvPath)) and IsPortalMode and (Trim(ConfigPage.Values[3]) = '') then
  begin
    Result := 'Modalita'' Portal: specificare il PRAMAIA_JWT_SECRET (parametro /JWTSECRET=...).';
    Exit;
  end;

  { 1) Ferma il servizio Windows se presente }
  Exec('sc.exe', 'stop {#MyServiceName}', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Sleep(1500);

  { 2) Termina eventuali processi residui che tengono lock sui file }
  Exec('taskkill.exe', '/F /IM {#MyAppExeName}', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Sleep(500);

  { 3) Attesa breve perche' Windows rilasci gli handle }
  Sleep(1000);
end;

{ ---------------------------------------------------------------------------
  Post-installazione: .env, permessi, servizio, firewall (in quest'ordine)
  --------------------------------------------------------------------------- }

procedure WriteEnvFile;
var
  Content, Host, Standalone, Port: String;
begin
  if IsPortalMode then
  begin
    Host := '0.0.0.0';
    Standalone := 'false';
  end
  else
  begin
    Host := '127.0.0.1';
    Standalone := 'true';
  end;
  Port := Trim(ConfigPage.Values[0]);

  Content :=
    '# PramaIA Licensing Server - generato dall''installer il ' + GetDateTimeString('yyyy/mm/dd hh:nn', '-', ':') + NL +
    'APP_NAME=PramaIA Licensing Server' + NL +
    'APP_ID=pramaia-licserver' + NL +
    NL +
    '# true = nessun login (solo per uso locale). false = login obbligatorio tramite Portal' + NL +
    'STANDALONE_MODE=' + Standalone + NL +
    NL;
  if Trim(ConfigPage.Values[3]) <> '' then
    Content := Content +
      '# Deve coincidere con PRAMAIA_JWT_SECRET del Portal' + NL +
      'PRAMAIA_JWT_SECRET=''' + Trim(ConfigPage.Values[3]) + '''' + NL + NL;
  Content := Content +
    'PORTAL_URL=' + Trim(ConfigPage.Values[1]) + NL +
    'PORTAL_API_URL=' + Trim(ConfigPage.Values[2]) + NL +
    NL +
    '# 127.0.0.1 = solo locale, 0.0.0.0 = raggiungibile in rete' + NL +
    'SERVICE_HOST=' + Host + NL +
    'BACKEND_PORT=' + Port + NL +
    '# Backend e frontend sono serviti dalla stessa porta (usato da register_to_portal.py)' + NL +
    'FRONTEND_PORT=' + Port + NL +
    NL +
    '# Dati persistenti (relativi alla cartella di installazione): NON cancellare data\keys' + NL +
    'DATABASE_URL=sqlite:///./data/pramaia-licserver.db' + NL +
    'KEYS_DIR=./data/keys' + NL +
    NL +
    'LOG_LEVEL=INFO' + NL +
    NL +
    '# Mind integration (opzionale)' + NL +
    'MIND_URL=http://localhost:8100' + NL +
    'USE_MIND_INTEGRATION=false' + NL;

  if SaveStringToFile(EnvPath, Content, False) then
    Log('Creato ' + EnvPath)
  else
    SuppressibleMsgBox('Impossibile creare ' + EnvPath, mbError, MB_OK, IDOK);
end;

{ .env (contiene il secret JWT) e data\ (database clienti + chiave privata di firma):
  accesso solo a SYSTEM e Administrators. Il servizio gira come LocalSystem. }
procedure LockDownPermissions;
var
  DataDir, Env: String;
begin
  Env := ExpandConstant('{app}\.env');
  DataDir := ExpandConstant('{app}\data');
  RunHidden(ExpandConstant('{sys}\icacls.exe'), '"' + Env + '" /inheritance:r /grant:r ' + SID_SYSTEM + ':(F) ' + SID_ADMINS + ':(F)');
  RunHidden(ExpandConstant('{sys}\icacls.exe'), '"' + DataDir + '" /inheritance:r /grant:r ' + SID_SYSTEM + ':(OI)(CI)(F) ' + SID_ADMINS + ':(OI)(CI)(F)');
end;

procedure InstallService;
var
  App: String;
begin
  App := ExpandConstant('{app}');
  { Rimozione preventiva: rende l'operazione idempotente negli aggiornamenti }
  Nssm('remove {#MyServiceName} confirm');
  if Nssm('install {#MyServiceName} "' + App + '\{#MyAppExeName}"') <> 0 then
  begin
    SuppressibleMsgBox('Installazione del servizio Windows non riuscita. Vedi il log di setup (/LOG).', mbError, MB_OK, IDOK);
    Exit;
  end;
  Nssm('set {#MyServiceName} AppDirectory "' + App + '"');
  Nssm('set {#MyServiceName} DisplayName "{#MyAppName}"');
  Nssm('set {#MyServiceName} Description "Gestione e firma delle licenze PramaIA"');
  Nssm('set {#MyServiceName} Start SERVICE_AUTO_START');
  Nssm('set {#MyServiceName} AppStdout "' + App + '\logs\service.log"');
  Nssm('set {#MyServiceName} AppStderr "' + App + '\logs\service-error.log"');
  Nssm('set {#MyServiceName} AppRotateFiles 1');
  Nssm('set {#MyServiceName} AppRotateBytes 5242880');
  Nssm('set {#MyServiceName} AppExit Default Restart');
  Nssm('start {#MyServiceName}');
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssPostInstall then
  begin
    if not FileExists(ExpandConstant('{app}\.env')) then
      WriteEnvFile;
    LockDownPermissions;

    if WizardIsTaskSelected('firewall') then
    begin
      RunHidden(ExpandConstant('{sys}\netsh.exe'), 'advfirewall firewall delete rule name="{#MyFirewallRule}"');
      RunHidden(ExpandConstant('{sys}\netsh.exe'),
        'advfirewall firewall add rule name="{#MyFirewallRule}" dir=in action=allow protocol=TCP localport=' + GetBackendPort(''));
    end;

    if WizardIsTaskSelected('installservice') then
      InstallService;
  end;
end;
