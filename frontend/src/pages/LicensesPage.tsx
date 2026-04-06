import React, { useState, useEffect, useCallback } from 'react';
import {
  Typography, Box, Card, CardContent, Button, TextField, IconButton,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Paper, Chip, Dialog, DialogTitle, DialogContent, DialogActions,
  FormControl, InputLabel, Select, MenuItem, Grid, Alert, Tooltip,
  TablePagination, InputAdornment, CircularProgress, Tabs, Tab,
  Accordion, AccordionSummary, AccordionDetails, Switch, FormControlLabel,
  Divider,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import AddIcon from '@mui/icons-material/Add';
import DownloadIcon from '@mui/icons-material/Download';
import VisibilityIcon from '@mui/icons-material/Visibility';
import RefreshIcon from '@mui/icons-material/Refresh';
import BlockIcon from '@mui/icons-material/Block';
import VerifiedIcon from '@mui/icons-material/Verified';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import DeleteIcon from '@mui/icons-material/Delete';
import { PramaLayout } from '../components/PramaLayout';
import { apiClient } from '../services/apiClient';
import { authGuard } from '../services/authGuard';

// Types
interface Customer {
  name: string;
  vat_or_cf: string;
}

interface Entitlements {
  modules: string[];
  max_users: number;
  max_instances: number;
  max_version?: string;
}

interface Environment {
  fingerprint?: string;
  deployment_type: string;
}

interface Validity {
  issued_at?: string;
  expires_at: string;
  maintenance_until?: string;
}

// Multi-app types
interface AppUserLimits {
  admin: number;
  standard: number;
  viewer: number;
}

interface AppEntitlement {
  enabled: boolean;
  modules: string[];
  users: AppUserLimits;
  max_instances: number;
  features?: Record<string, any>;
}

interface GlobalLimits {
  total_users: number;
  total_instances: number;
  total_apps: number;
}

interface License {
  license_id: string;
  customer: Customer;
  entitlements: Entitlements;
  environment: Environment;
  validity: Validity;
  status: string;
  tenant_id?: string;
  apps_entitlements?: Record<string, AppEntitlement>;
  global_limits?: GlobalLimits;
}

interface LicenseListResponse {
  licenses: License[];
  total: number;
}

interface CustomerOption {
  customer_id: string;
  name: string;
  vat_or_cf: string;
}

interface SignedLicenseResponse {
  success: boolean;
  message: string;
  signed_license: any;
  filename: string;
}

interface VerifyResponse {
  valid: boolean;
  message: string;
  license_id?: string;
  customer_name?: string;
  expires_at?: string;
}

const STATUS_COLORS: Record<string, 'success' | 'warning' | 'error' | 'info' | 'default'> = {
  active: 'success',
  pending: 'warning',
  expired: 'error',
  revoked: 'error',
  deactivated: 'default',
  suspended: 'warning',
};

// Type for apps loaded from backend
interface AppConfig {
  id: string;
  name: string;
  description?: string;
  modules: string[];
}

interface AppsConfigResponse {
  apps: AppConfig[];
  source: string;
}

const LicensesPage: React.FC = () => {
  const user = authGuard.getCurrentUser();
  const isAdmin = user?.is_admin;
  
  // State
  const [licenses, setLicenses] = useState<License[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [total, setTotal] = useState(0);
  
  // Dialog states
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [verifyDialogOpen, setVerifyDialogOpen] = useState(false);
  const [selectedLicense, setSelectedLicense] = useState<License | null>(null);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  
  // Create form state
  const [newLicense, setNewLicense] = useState({
    customer_name: '',
    customer_vat: '',
    modules: [] as string[],
    max_users: 10,
    max_instances: 1,
    deployment_type: 'on_prem',
    expires_at: '',
    maintenance_until: '',
  });
  
  // Multi-app state
  const [useMultiApp, setUseMultiApp] = useState(false);
  const [appsEntitlements, setAppsEntitlements] = useState<Record<string, AppEntitlement>>({});
  const [globalLimits, setGlobalLimits] = useState<GlobalLimits>({
    total_users: -1,
    total_instances: -1,
    total_apps: -1,
  });
  
  // Verify state
  const [verifyFile, setVerifyFile] = useState<File | null>(null);
  const [verifyResult, setVerifyResult] = useState<VerifyResponse | null>(null);
  const [verifying, setVerifying] = useState(false);
  
  // Tab state
  const [activeTab, setActiveTab] = useState(0);
  
  // Apps config (loaded from backend)
  const [availableApps, setAvailableApps] = useState<AppConfig[]>([]);
  const [modulesOptions, setModulesOptions] = useState<string[]>([]);
  const [appsLoading, setAppsLoading] = useState(true);

  // Load apps configuration from backend
  const loadAppsConfig = useCallback(async () => {
    setAppsLoading(true);
    try {
      const data = await apiClient.get<AppsConfigResponse>('/api/config/apps');
      setAvailableApps(data.apps);
      
      // Collect all unique modules from all apps
      const allModules = new Set<string>();
      data.apps.forEach(app => {
        app.modules.forEach(m => allModules.add(m));
      });
      setModulesOptions(Array.from(allModules).sort());
    } catch (err) {
      console.error('Failed to load apps config:', err);
      // Fallback
      setAvailableApps([
        { id: 'pramaia-mind', name: 'PramaIA Mind', description: 'AI Assistant', modules: ['chat', 'documents'] },
      ]);
      setModulesOptions(['chat', 'documents', 'analysis']);
    } finally {
      setAppsLoading(false);
    }
  }, []);

  // Load licenses
  const loadLicenses = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.append('status', statusFilter);
      params.append('limit', rowsPerPage.toString());
      params.append('offset', (page * rowsPerPage).toString());
      
      const url = `/api/licenses/${params.toString() ? '?' + params.toString() : ''}`;
      const data = await apiClient.get<LicenseListResponse>(url);
      
      // Filter by search on client side (for now)
      let filtered = data.licenses;
      if (search) {
        const s = search.toLowerCase();
        filtered = filtered.filter(l => 
          l.license_id.toLowerCase().includes(s) ||
          l.customer.name.toLowerCase().includes(s) ||
          l.customer.vat_or_cf.toLowerCase().includes(s)
        );
      }
      
      setLicenses(filtered);
      setTotal(data.total);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, page, rowsPerPage, search]);

  // Load customers for dropdown
  const loadCustomers = async () => {
    try {
      const data = await apiClient.get<CustomerOption[]>('/api/customers/all');
      setCustomers(data);
    } catch (err) {
      console.error('Failed to load customers', err);
    }
  };

  useEffect(() => {
    loadLicenses();
    loadAppsConfig();
  }, [loadLicenses, loadAppsConfig]);

  useEffect(() => {
    if (createDialogOpen) loadCustomers();
  }, [createDialogOpen]);

  // Handlers
  const handleCreateLicense = async () => {
    try {
      const payload: any = {
        customer: {
          name: newLicense.customer_name,
          vat_or_cf: newLicense.customer_vat,
        },
        environment: {
          deployment_type: newLicense.deployment_type,
        },
        validity: {
          expires_at: newLicense.expires_at,
          maintenance_until: newLicense.maintenance_until || undefined,
        },
      };
      
      // Add multi-app entitlements if enabled, otherwise use legacy entitlements
      if (useMultiApp && Object.keys(appsEntitlements).length > 0) {
        payload.apps_entitlements = appsEntitlements;
        payload.global_limits = globalLimits;
        // Legacy entitlements: calcola totale dagli app entitlements
        let totalUsers = 0;
        let totalInstances = 0;
        Object.values(appsEntitlements).forEach((ent: any) => {
          if (ent.users) {
            totalUsers += (ent.users.admin || 0) + (ent.users.standard || 0) + (ent.users.viewer || 0);
          }
          totalInstances += ent.max_instances || 1;
        });
        payload.entitlements = {
          modules: [],
          max_users: totalUsers || 1,
          max_instances: totalInstances || 1,
        };
      } else {
        payload.entitlements = {
          modules: newLicense.modules,
          max_users: newLicense.max_users,
          max_instances: newLicense.max_instances,
        };
      }
      
      await apiClient.post('/api/licenses/issue-license', payload);
      setSuccess('Licenza creata con successo');
      setCreateDialogOpen(false);
      // Reset form
      setNewLicense({
        customer_name: '',
        customer_vat: '',
        modules: [],
        max_users: 10,
        max_instances: 1,
        deployment_type: 'on_prem',
        expires_at: '',
        maintenance_until: '',
      });
      setUseMultiApp(false);
      setAppsEntitlements({});
      setGlobalLimits({ total_users: -1, total_instances: -1, total_apps: -1 });
      loadLicenses();
    } catch (err: any) {
      setError(err.message);
    }
  };

  // Multi-app helpers
  const addAppEntitlement = (appId: string) => {
    if (!appsEntitlements[appId]) {
      setAppsEntitlements({
        ...appsEntitlements,
        [appId]: {
          enabled: true,
          modules: [],
          users: { admin: 1, standard: 5, viewer: 10 },
          max_instances: 1,
        },
      });
    }
  };

  const removeAppEntitlement = (appId: string) => {
    const updated = { ...appsEntitlements };
    delete updated[appId];
    setAppsEntitlements(updated);
  };

  const updateAppEntitlement = (appId: string, field: string, value: any) => {
    setAppsEntitlements({
      ...appsEntitlements,
      [appId]: {
        ...appsEntitlements[appId],
        [field]: value,
      },
    });
  };

  const updateAppUserLimit = (appId: string, role: string, value: number) => {
    setAppsEntitlements({
      ...appsEntitlements,
      [appId]: {
        ...appsEntitlements[appId],
        users: {
          ...appsEntitlements[appId].users,
          [role]: value,
        },
      },
    });
  };

  const handleDownloadLicense = async (licenseId: string) => {
    try {
      await apiClient.downloadJson(
        `/api/license-files/${licenseId}/download`,
        `${licenseId}.lic.json`
      );
      setSuccess(`File licenza ${licenseId} scaricato`);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleDeleteLicense = async (licenseId: string) => {
    if (!window.confirm(`Sei sicuro di voler eliminare definitivamente la licenza ${licenseId}? Questa operazione è irreversibile.`)) {
      return;
    }
    
    try {
      await apiClient.delete(`/api/licenses/${licenseId}`);
      setSuccess(`Licenza ${licenseId} eliminata`);
      loadLicenses();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleViewLicense = (license: License) => {
    setSelectedLicense(license);
    setViewDialogOpen(true);
  };

  const handleVerifyFile = async () => {
    if (!verifyFile) return;
    
    setVerifying(true);
    setVerifyResult(null);
    
    try {
      const content = await verifyFile.text();
      const signedLicense = JSON.parse(content);
      
      const result = await apiClient.post<VerifyResponse>('/api/license-files/verify', {
        signed_license: signedLicense,
      });
      
      setVerifyResult(result);
    } catch (err: any) {
      setVerifyResult({
        valid: false,
        message: err.message || 'Errore durante la verifica',
      });
    } finally {
      setVerifying(false);
    }
  };

  const handleCustomerSelect = (customerId: string) => {
    const customer = customers.find((c: CustomerOption) => c.customer_id === customerId);
    if (customer) {
      setNewLicense((prev: typeof newLicense) => ({
        ...prev,
        customer_name: customer.name,
        customer_vat: customer.vat_or_cf,
      }));
    }
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('it-IT');
  };

  return (
    <PramaLayout pageTitle="Gestione Licenze">
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      {success && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess(null)}>
          {success}
        </Alert>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)} sx={{ mb: 3 }}>
        <Tab label="Elenco Licenze" />
        <Tab label="Verifica File" />
      </Tabs>

      {/* Tab: License List */}
      {activeTab === 0 && (
        <>
          {/* Toolbar */}
          <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
            <TextField
              placeholder="Cerca per ID, cliente, P.IVA..."
              size="small"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon />
                  </InputAdornment>
                ),
              }}
              sx={{ minWidth: 280 }}
            />
            
            <FormControl size="small" sx={{ minWidth: 150 }}>
              <InputLabel>Stato</InputLabel>
              <Select
                value={statusFilter}
                label="Stato"
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <MenuItem value="">Tutti</MenuItem>
                <MenuItem value="active">Attiva</MenuItem>
                <MenuItem value="pending">In attesa</MenuItem>
                <MenuItem value="expired">Scaduta</MenuItem>
                <MenuItem value="revoked">Revocata</MenuItem>
                <MenuItem value="suspended">Sospesa</MenuItem>
              </Select>
            </FormControl>
            
            <Box sx={{ flex: 1 }} />
            
            <Button
              variant="outlined"
              startIcon={<RefreshIcon />}
              onClick={() => loadLicenses()}
            >
              Aggiorna
            </Button>
            
            {isAdmin && (
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={() => setCreateDialogOpen(true)}
              >
                Nuova Licenza
              </Button>
            )}
          </Box>

          {/* Table */}
          <TableContainer component={Paper}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>ID Licenza</TableCell>
                  <TableCell>Cliente</TableCell>
                  <TableCell>P.IVA/CF</TableCell>
                  <TableCell>Moduli</TableCell>
                  <TableCell>Utenti/Istanze</TableCell>
                  <TableCell>Scadenza</TableCell>
                  <TableCell>Stato</TableCell>
                  <TableCell align="right">Azioni</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell component="td" {...{ colSpan: 8 }} align="center" sx={{ py: 4 }}>
                      <CircularProgress size={32} />
                    </TableCell>
                  </TableRow>
                ) : licenses.length === 0 ? (
                  <TableRow>
                    <TableCell component="td" {...{ colSpan: 8 }} align="center" sx={{ py: 4 }}>
                      <Typography color="text.secondary">Nessuna licenza trovata</Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  licenses.map((license) => (
                    <TableRow key={license.license_id} hover>
                      <TableCell>
                        <Typography variant="body2" fontWeight={600}>
                          {license.license_id}
                        </Typography>
                      </TableCell>
                      <TableCell>{license.customer.name}</TableCell>
                      <TableCell>{license.customer.vat_or_cf}</TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                          {license.entitlements.modules.slice(0, 3).map((m) => (
                            <Chip key={m} label={m} size="small" variant="outlined" />
                          ))}
                          {license.entitlements.modules.length > 3 && (
                            <Chip
                              label={`+${license.entitlements.modules.length - 3}`}
                              size="small"
                              variant="outlined"
                            />
                          )}
                        </Box>
                      </TableCell>
                      <TableCell>
                        {license.entitlements.max_users} / {license.entitlements.max_instances}
                      </TableCell>
                      <TableCell>{formatDate(license.validity.expires_at)}</TableCell>
                      <TableCell>
                        <Chip
                          label={license.status}
                          size="small"
                          color={STATUS_COLORS[license.status] || 'default'}
                        />
                      </TableCell>
                      <TableCell align="right">
                        <Tooltip title="Visualizza">
                          <IconButton size="small" onClick={() => handleViewLicense(license)}>
                            <VisibilityIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Scarica file firmato">
                          <IconButton
                            size="small"
                            onClick={() => handleDownloadLicense(license.license_id)}
                          >
                            <DownloadIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        {isAdmin && (
                          <Tooltip title="Elimina licenza">
                            <IconButton
                              size="small"
                              color="error"
                              onClick={() => handleDeleteLicense(license.license_id)}
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
            <TablePagination
              component="div"
              count={total}
              page={page}
              onPageChange={(_, p) => setPage(p)}
              rowsPerPage={rowsPerPage}
              onRowsPerPageChange={(e) => {
                setRowsPerPage(parseInt(e.target.value, 10));
                setPage(0);
              }}
              labelRowsPerPage="Righe per pagina:"
            />
          </TableContainer>
        </>
      )}

      {/* Tab: Verify File */}
      {activeTab === 1 && (
        <Card sx={{ maxWidth: 600 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Verifica File Licenza
            </Typography>
            <Typography color="text.secondary" sx={{ mb: 3 }}>
              Carica un file .lic.json per verificare l'autenticità della firma digitale.
            </Typography>
            
            <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', mb: 3 }}>
              <Button variant="outlined" component="label">
                Seleziona File
                <input
                  type="file"
                  hidden
                  accept=".json,.lic.json"
                  onChange={(e) => {
                    setVerifyFile(e.target.files?.[0] || null);
                    setVerifyResult(null);
                  }}
                />
              </Button>
              {verifyFile && (
                <Typography variant="body2" color="text.secondary">
                  {verifyFile.name}
                </Typography>
              )}
            </Box>
            
            <Button
              variant="contained"
              onClick={handleVerifyFile}
              disabled={!verifyFile || verifying}
              startIcon={verifying ? <CircularProgress size={16} /> : <VerifiedIcon />}
            >
              Verifica Firma
            </Button>
            
            {verifyResult && (
              <Alert
                severity={verifyResult.valid ? 'success' : 'error'}
                sx={{ mt: 3 }}
                icon={verifyResult.valid ? <VerifiedIcon /> : <BlockIcon />}
              >
                <Typography fontWeight={600}>
                  {verifyResult.valid ? 'Firma Valida' : 'Firma Non Valida'}
                </Typography>
                <Typography variant="body2">{verifyResult.message}</Typography>
                {verifyResult.valid && verifyResult.license_id && (
                  <Box sx={{ mt: 1 }}>
                    <Typography variant="body2">
                      <strong>ID:</strong> {verifyResult.license_id}
                    </Typography>
                    <Typography variant="body2">
                      <strong>Cliente:</strong> {verifyResult.customer_name}
                    </Typography>
                    <Typography variant="body2">
                      <strong>Scadenza:</strong> {formatDate(verifyResult.expires_at)}
                    </Typography>
                  </Box>
                )}
              </Alert>
            )}
          </CardContent>
        </Card>
      )}

      {/* Create License Dialog */}
      <Dialog open={createDialogOpen} onClose={() => setCreateDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>Crea Nuova Licenza</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            {/* Customer Selection */}
            <Grid item xs={12}>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>Cliente</Typography>
            </Grid>
            <Grid item xs={12} md={6}>
              <FormControl fullWidth size="small">
                <InputLabel>Seleziona Cliente Esistente</InputLabel>
                <Select
                  label="Seleziona Cliente Esistente"
                  onChange={(e) => handleCustomerSelect(e.target.value as string)}
                >
                  {customers.map((c) => (
                    <MenuItem key={c.customer_id} value={c.customer_id}>
                      {c.name} ({c.vat_or_cf})
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={6}>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                Oppure inserisci manualmente:
              </Typography>
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                label="Nome Cliente"
                fullWidth
                size="small"
                value={newLicense.customer_name}
                onChange={(e) => setNewLicense({ ...newLicense, customer_name: e.target.value })}
                required
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                label="P.IVA / Codice Fiscale"
                fullWidth
                size="small"
                value={newLicense.customer_vat}
                onChange={(e) => setNewLicense({ ...newLicense, customer_vat: e.target.value })}
                required
              />
            </Grid>
            
            {/* Entitlements - solo se NON in modalità Multi-App */}
            {!useMultiApp && (
              <>
                <Grid item xs={12}>
                  <Typography variant="subtitle2" sx={{ mb: 1, mt: 2 }}>Moduli e Limiti</Typography>
                </Grid>
                <Grid item xs={12}>
                  <FormControl fullWidth size="small">
                    <InputLabel>Moduli Abilitati</InputLabel>
                    <Select
                      multiple
                      label="Moduli Abilitati"
                      value={newLicense.modules}
                      onChange={(e) => setNewLicense({ ...newLicense, modules: e.target.value as string[] })}
                      renderValue={(selected) => (
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                          {(selected as string[]).map((value) => (
                            <Chip key={value} label={value} size="small" />
                          ))}
                        </Box>
                      )}
                    >
                      {modulesOptions.map((mod) => (
                        <MenuItem key={mod} value={mod}>{mod}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={6} md={3}>
                  <TextField
                    label="Max Utenti"
                    type="number"
                    fullWidth
                    size="small"
                    value={newLicense.max_users}
                    onChange={(e) => setNewLicense({ ...newLicense, max_users: parseInt(e.target.value) || 1 })}
                    inputProps={{ min: 1 }}
                  />
                </Grid>
                <Grid item xs={6} md={3}>
                  <TextField
                    label="Max Istanze"
                    type="number"
                    fullWidth
                    size="small"
                    value={newLicense.max_instances}
                    onChange={(e) => setNewLicense({ ...newLicense, max_instances: parseInt(e.target.value) || 1 })}
                    inputProps={{ min: 1 }}
                  />
                </Grid>
              </>
            )}
            
            <Grid item xs={12} md={6}>
              <FormControl fullWidth size="small">
                <InputLabel>Tipo Deployment</InputLabel>
                <Select
                  label="Tipo Deployment"
                  value={newLicense.deployment_type}
                  onChange={(e) => setNewLicense({ ...newLicense, deployment_type: e.target.value })}
                >
                  <MenuItem value="on_prem">On-Premise</MenuItem>
                  <MenuItem value="cloud">Cloud</MenuItem>
                  <MenuItem value="hybrid">Hybrid</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            
            {/* Validity */}
            <Grid item xs={12}>
              <Typography variant="subtitle2" sx={{ mb: 1, mt: 2 }}>Validità</Typography>
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                label="Data Scadenza"
                type="date"
                fullWidth
                size="small"
                value={newLicense.expires_at}
                onChange={(e) => setNewLicense({ ...newLicense, expires_at: e.target.value })}
                InputLabelProps={{ shrink: true }}
                required
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                label="Fine Manutenzione"
                type="date"
                fullWidth
                size="small"
                value={newLicense.maintenance_until}
                onChange={(e) => setNewLicense({ ...newLicense, maintenance_until: e.target.value })}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            
            {/* Multi-App Entitlements */}
            <Grid item xs={12}>
              <Divider sx={{ my: 2 }} />
              <FormControlLabel
                control={
                  <Switch
                    checked={useMultiApp}
                    onChange={(e) => setUseMultiApp(e.target.checked)}
                  />
                }
                label={
                  <Box>
                    <Typography variant="subtitle2">Modalità Multi-App</Typography>
                    <Typography variant="caption" color="text.secondary">
                      Configura limiti separati per ciascuna applicazione e ruolo utente
                    </Typography>
                  </Box>
                }
              />
            </Grid>
            
            {useMultiApp && (
              <>
                {/* Global Limits */}
                <Grid item xs={12}>
                  <Typography variant="subtitle2" sx={{ mt: 2, mb: 1 }}>Limiti Globali</Typography>
                  <Typography variant="caption" color="text.secondary">
                    Usa -1 per illimitato
                  </Typography>
                </Grid>
                <Grid item xs={4}>
                  <TextField
                    label="Tot. Utenti"
                    type="number"
                    fullWidth
                    size="small"
                    value={globalLimits.total_users}
                    onChange={(e) => setGlobalLimits({ ...globalLimits, total_users: parseInt(e.target.value) || -1 })}
                    inputProps={{ min: -1 }}
                  />
                </Grid>
                <Grid item xs={4}>
                  <TextField
                    label="Tot. Istanze"
                    type="number"
                    fullWidth
                    size="small"
                    value={globalLimits.total_instances}
                    onChange={(e) => setGlobalLimits({ ...globalLimits, total_instances: parseInt(e.target.value) || -1 })}
                    inputProps={{ min: -1 }}
                  />
                </Grid>
                <Grid item xs={4}>
                  <TextField
                    label="Tot. App"
                    type="number"
                    fullWidth
                    size="small"
                    value={globalLimits.total_apps}
                    onChange={(e) => setGlobalLimits({ ...globalLimits, total_apps: parseInt(e.target.value) || -1 })}
                    inputProps={{ min: -1 }}
                  />
                </Grid>
                
                {/* App Selection */}
                <Grid item xs={12}>
                  <Typography variant="subtitle2" sx={{ mt: 2, mb: 1 }}>Applicazioni</Typography>
                  <FormControl fullWidth size="small">
                    <InputLabel>Aggiungi App</InputLabel>
                    <Select
                      label="Aggiungi App"
                      value=""
                      onChange={(e) => addAppEntitlement(e.target.value as string)}
                    >
                      {availableApps.filter(app => !appsEntitlements[app.id]).map((app) => (
                        <MenuItem key={app.id} value={app.id}>
                          {app.name} - {app.description}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>
                
                {/* App Entitlements */}
                {Object.entries(appsEntitlements).map(([appId, ent]: [string, AppEntitlement]) => {
                  const appInfo = availableApps.find(a => a.id === appId);
                  return (
                    <Grid item xs={12} key={appId}>
                      <Accordion defaultExpanded>
                        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                          <Box sx={{ display: 'flex', alignItems: 'center', width: '100%', justifyContent: 'space-between' }}>
                            <Box>
                              <Typography variant="subtitle2">{appInfo?.name || appId}</Typography>
                              <Typography variant="caption" color="text.secondary">{appInfo?.description}</Typography>
                            </Box>
                            <IconButton
                              size="small"
                              onClick={(e) => { e.stopPropagation(); removeAppEntitlement(appId); }}
                              sx={{ mr: 1 }}
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </Box>
                        </AccordionSummary>
                        <AccordionDetails>
                          <Grid container spacing={2}>
                            <Grid item xs={12}>
                              <FormControlLabel
                                control={
                                  <Switch
                                    checked={ent.enabled}
                                    onChange={(e) => updateAppEntitlement(appId, 'enabled', e.target.checked)}
                                    size="small"
                                  />
                                }
                                label="Abilitata"
                              />
                            </Grid>
                            <Grid item xs={12}>
                              <Typography variant="caption" fontWeight={600}>Limiti Utenti per Ruolo</Typography>
                            </Grid>
                            <Grid item xs={4}>
                              <TextField
                                label="Admin"
                                type="number"
                                fullWidth
                                size="small"
                                value={ent.users.admin}
                                onChange={(e) => updateAppUserLimit(appId, 'admin', parseInt(e.target.value) || 0)}
                                inputProps={{ min: -1 }}
                                helperText="-1 = illim."
                              />
                            </Grid>
                            <Grid item xs={4}>
                              <TextField
                                label="Standard"
                                type="number"
                                fullWidth
                                size="small"
                                value={ent.users.standard}
                                onChange={(e) => updateAppUserLimit(appId, 'standard', parseInt(e.target.value) || 0)}
                                inputProps={{ min: -1 }}
                                helperText="-1 = illim."
                              />
                            </Grid>
                            <Grid item xs={4}>
                              <TextField
                                label="Viewer"
                                type="number"
                                fullWidth
                                size="small"
                                value={ent.users.viewer}
                                onChange={(e) => updateAppUserLimit(appId, 'viewer', parseInt(e.target.value) || 0)}
                                inputProps={{ min: -1 }}
                                helperText="-1 = illim."
                              />
                            </Grid>
                            <Grid item xs={6}>
                              <TextField
                                label="Max Istanze"
                                type="number"
                                fullWidth
                                size="small"
                                value={ent.max_instances}
                                onChange={(e) => updateAppEntitlement(appId, 'max_instances', parseInt(e.target.value) || 1)}
                                inputProps={{ min: 1 }}
                              />
                            </Grid>
                            <Grid item xs={6}>
                              <FormControl fullWidth size="small">
                                <InputLabel>Moduli</InputLabel>
                                <Select
                                  multiple
                                  label="Moduli"
                                  value={ent.modules}
                                  onChange={(e) => updateAppEntitlement(appId, 'modules', e.target.value as string[])}
                                  renderValue={(selected) => (selected as string[]).join(', ')}
                                >
                                  {modulesOptions.map((mod) => (
                                    <MenuItem key={mod} value={mod}>{mod}</MenuItem>
                                  ))}
                                </Select>
                              </FormControl>
                            </Grid>
                          </Grid>
                        </AccordionDetails>
                      </Accordion>
                    </Grid>
                  );
                })}
              </>
            )}
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateDialogOpen(false)}>Annulla</Button>
          <Button
            variant="contained"
            onClick={handleCreateLicense}
            disabled={!newLicense.customer_name || !newLicense.customer_vat || !newLicense.expires_at}
          >
            Crea Licenza
          </Button>
        </DialogActions>
      </Dialog>

      {/* View License Dialog */}
      <Dialog open={viewDialogOpen} onClose={() => setViewDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          Dettagli Licenza
          <Chip
            label={selectedLicense?.status}
            size="small"
            color={STATUS_COLORS[selectedLicense?.status || ''] || 'default'}
            sx={{ ml: 2 }}
          />
        </DialogTitle>
        <DialogContent>
          {selectedLicense && (
            <Box>
              <Typography variant="h6" sx={{ mb: 2 }}>
                {selectedLicense.license_id}
              </Typography>
              
              <Typography variant="subtitle2" color="text.secondary">Cliente</Typography>
              <Typography sx={{ mb: 2 }}>
                {selectedLicense.customer.name}<br />
                <Typography component="span" variant="body2" color="text.secondary">
                  {selectedLicense.customer.vat_or_cf}
                </Typography>
              </Typography>
              
              <Typography variant="subtitle2" color="text.secondary">Moduli</Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 2 }}>
                {selectedLicense.entitlements.modules.map((m) => (
                  <Chip key={m} label={m} size="small" />
                ))}
              </Box>
              
              <Typography variant="subtitle2" color="text.secondary">Limiti</Typography>
              <Typography sx={{ mb: 2 }}>
                Max Utenti: {selectedLicense.entitlements.max_users} | 
                Max Istanze: {selectedLicense.entitlements.max_instances}
              </Typography>
              
              <Typography variant="subtitle2" color="text.secondary">Deployment</Typography>
              <Typography sx={{ mb: 2 }}>
                {selectedLicense.environment.deployment_type}
                {selectedLicense.environment.fingerprint && (
                  <><br />Fingerprint: {selectedLicense.environment.fingerprint}</>
                )}
              </Typography>
              
              <Typography variant="subtitle2" color="text.secondary">Validità</Typography>
              <Typography>
                Emessa: {formatDate(selectedLicense.validity.issued_at)}<br />
                Scadenza: {formatDate(selectedLicense.validity.expires_at)}<br />
                Manutenzione fino a: {formatDate(selectedLicense.validity.maintenance_until)}
              </Typography>
              
              {/* Multi-App Entitlements */}
              {selectedLicense.apps_entitlements && Object.keys(selectedLicense.apps_entitlements).length > 0 && (
                <>
                  <Divider sx={{ my: 2 }} />
                  <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
                    Entitlement Multi-App
                  </Typography>
                  {Object.entries(selectedLicense.apps_entitlements).map(([appId, ent]: [string, AppEntitlement]) => {
                    const appInfo = availableApps.find(a => a.id === appId);
                    return (
                      <Box key={appId} sx={{ mb: 2, p: 1.5, bgcolor: 'grey.50', borderRadius: 1 }}>
                        <Typography variant="body2" fontWeight={600}>
                          {appInfo?.name || appId}
                          {!ent.enabled && <Chip label="Disabilitata" size="small" color="warning" sx={{ ml: 1 }} />}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          Utenti: Admin {ent.users.admin === -1 ? '∞' : ent.users.admin} | 
                          Standard {ent.users.standard === -1 ? '∞' : ent.users.standard} | 
                          Viewer {ent.users.viewer === -1 ? '∞' : ent.users.viewer}
                        </Typography>
                        <br />
                        <Typography variant="caption" color="text.secondary">
                          Istanze: {ent.max_instances} | Moduli: {ent.modules?.join(', ') || 'tutti'}
                        </Typography>
                      </Box>
                    );
                  })}
                </>
              )}
              
              {selectedLicense.global_limits && (
                <>
                  <Typography variant="subtitle2" color="text.secondary" sx={{ mt: 2 }}>Limiti Globali</Typography>
                  <Typography variant="body2">
                    Tot. Utenti: {selectedLicense.global_limits.total_users === -1 ? '∞' : selectedLicense.global_limits.total_users} | 
                    Tot. Istanze: {selectedLicense.global_limits.total_instances === -1 ? '∞' : selectedLicense.global_limits.total_instances} | 
                    Tot. App: {selectedLicense.global_limits.total_apps === -1 ? '∞' : selectedLicense.global_limits.total_apps}
                  </Typography>
                </>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button
            startIcon={<DownloadIcon />}
            onClick={() => {
              if (selectedLicense) handleDownloadLicense(selectedLicense.license_id);
            }}
          >
            Scarica File Firmato
          </Button>
          <Button onClick={() => setViewDialogOpen(false)}>Chiudi</Button>
        </DialogActions>
      </Dialog>
    </PramaLayout>
  );
};

export default LicensesPage;
