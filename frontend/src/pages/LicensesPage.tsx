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
import { useTranslation } from 'react-i18next';
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

// Richieste di attivazione importate dal file del Portal
// (vedi C:/PramaIA-HelpDesk/docs/LICENZE_MODULI_STANDARD.md §3)
interface ActivationRequestModuleCatalogEntry {
  code: string;
  name?: Record<string, string>;
  [key: string]: any;
}

interface ActivationRequestItem {
  request_id: string;
  customer_name: string;
  customer_vat_or_cf: string;
  customer_email?: string;
  status: string;
  requested_at: string;
  processed_at?: string;
  issued_license_id?: string;
  app_id?: string;
  app_name?: string;
  app_version?: string;
  fingerprint?: string;
  deployment_type?: string;
  requested_modules?: string[];
  requested_max_users?: number;
  modules_catalog?: ActivationRequestModuleCatalogEntry[];
  umbrella_module?: string;
  source?: string;
  notes?: string;
}

interface ActivationRequestListResponse {
  requests: ActivationRequestItem[];
  total: number;
}

interface ImportActivationRequestsResponse {
  success: boolean;
  import_batch_id: string;
  imported: { request_id: string; app_id: string; app_name?: string; status: string }[];
  message: string;
}

const REQUEST_STATUS_COLORS: Record<string, 'success' | 'warning' | 'error' | 'default'> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'error',
};

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
  const { t } = useTranslation();
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
    fingerprint: '',
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
  const [appsError, setAppsError] = useState<string | null>(null);

  // Activation requests (importate dal file del Portal)
  const [activationRequests, setActivationRequests] = useState<ActivationRequestItem[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [requestsError, setRequestsError] = useState<string | null>(null);
  const [importingRequest, setImportingRequest] = useState(false);

  // Load apps configuration from backend
  const loadAppsConfig = useCallback(async () => {
    setAppsLoading(true);
    setAppsError(null);
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
      // Nessuna app inventata: una licenza firmata per un'app inesistente sarebbe un danno silenzioso.
      setAvailableApps([]);
      setAppsError(t('licenses.appsConfigError'));
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

  // Load activation requests (solo Admin: l'endpoint richiede require_admin)
  const loadActivationRequests = useCallback(async () => {
    setLoadingRequests(true);
    setRequestsError(null);
    try {
      const data = await apiClient.get<ActivationRequestListResponse>('/api/licenses/activation-requests?limit=100');
      setActivationRequests(data.requests || []);
    } catch (err: any) {
      console.error('Failed to load activation requests:', err);
      setRequestsError(err.message || t('licenses.requests.loadFailed'));
    } finally {
      setLoadingRequests(false);
    }
  }, []);

  useEffect(() => {
    loadLicenses();
    loadAppsConfig();
    if (isAdmin) loadActivationRequests();
  }, [loadLicenses, loadAppsConfig, loadActivationRequests, isAdmin]);

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
          fingerprint: newLicense.fingerprint || undefined,
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
      setSuccess(t('licenses.createdSuccess'));
      setCreateDialogOpen(false);
      // Reset form
      setNewLicense({
        customer_name: '',
        customer_vat: '',
        modules: [],
        max_users: 10,
        max_instances: 1,
        deployment_type: 'on_prem',
        fingerprint: '',
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
      setSuccess(t('licenses.downloadedSuccess', { id: licenseId }));
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleDeleteLicense = async (licenseId: string) => {
    if (!window.confirm(t('licenses.confirmDelete', { id: licenseId }))) {
      return;
    }
    
    try {
      await apiClient.delete(`/api/licenses/${licenseId}`);
      setSuccess(t('licenses.deletedSuccess', { id: licenseId }));
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
        message: err.message || t('licenses.verify.errorGeneric'),
      });
    } finally {
      setVerifying(false);
    }
  };

  const handleImportRequestFile = async (file: File) => {
    setImportingRequest(true);
    setRequestsError(null);
    try {
      const content = await file.text();
      let payload: any;
      try {
        payload = JSON.parse(content);
      } catch {
        throw new Error(t('licenses.requests.invalidJson'));
      }
      const result = await apiClient.post<ImportActivationRequestsResponse>(
        '/api/licenses/activation-requests/import',
        payload
      );
      setSuccess(result.message);
      await loadActivationRequests();
    } catch (err: any) {
      setRequestsError(err.message || t('licenses.requests.importFailed'));
    } finally {
      setImportingRequest(false);
    }
  };

  // Precompila il dialog di creazione con i dati della richiesta (cliente, fingerprint,
  // moduli richiesti filtrati sul catalogo dell'app). L'operatore personalizza il resto
  // nel dialog esistente, inclusa la modalità Multi-App se serve.
  const handleUseActivationRequest = (req: ActivationRequestItem) => {
    const catalogCodes = (req.modules_catalog || []).map((m) => m.code);
    if (catalogCodes.length > 0) {
      setModulesOptions((prev) => Array.from(new Set([...prev, ...catalogCodes])).sort());
    }
    const preselected = (req.requested_modules || []).filter(
      (m) => catalogCodes.length === 0 || catalogCodes.includes(m)
    );
    setNewLicense((prev) => ({
      ...prev,
      customer_name: req.customer_name,
      customer_vat: req.customer_vat_or_cf,
      modules: preselected,
      max_users: req.requested_max_users || prev.max_users,
      deployment_type: req.deployment_type || prev.deployment_type,
      fingerprint: req.fingerprint || '',
    }));
    setUseMultiApp(false);
    setCreateDialogOpen(true);
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
    <PramaLayout pageTitle={t('licenses.pageTitle')}>
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
        <Tab label={t('licenses.tabs.list')} />
        <Tab label={t('licenses.tabs.verify')} />
        {isAdmin && <Tab label={t('licenses.tabs.requests')} />}
      </Tabs>

      {/* Tab: License List */}
      {activeTab === 0 && (
        <>
          {/* Toolbar */}
          <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
            <TextField
              placeholder={t('licenses.toolbar.search')}
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
              <InputLabel>{t('licenses.toolbar.statusLabel')}</InputLabel>
              <Select
                value={statusFilter}
                label={t('licenses.toolbar.statusLabel')}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <MenuItem value="">{t('common.all')}</MenuItem>
                <MenuItem value="active">{t('licenses.toolbar.statusActive')}</MenuItem>
                <MenuItem value="pending">{t('licenses.toolbar.statusPending')}</MenuItem>
                <MenuItem value="expired">{t('licenses.toolbar.statusExpired')}</MenuItem>
                <MenuItem value="revoked">{t('licenses.toolbar.statusRevoked')}</MenuItem>
                <MenuItem value="suspended">{t('licenses.toolbar.statusSuspended')}</MenuItem>
              </Select>
            </FormControl>
            
            <Box sx={{ flex: 1 }} />
            
            <Button
              variant="outlined"
              startIcon={<RefreshIcon />}
              onClick={() => loadLicenses()}
            >
              {t('common.refresh')}
            </Button>
            
            {isAdmin && (
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={() => setCreateDialogOpen(true)}
              >
                {t('licenses.toolbar.newLicense')}
              </Button>
            )}
          </Box>

          {/* Table */}
          <TableContainer component={Paper}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>{t('licenses.table.licenseId')}</TableCell>
                  <TableCell>{t('licenses.table.customer')}</TableCell>
                  <TableCell>{t('licenses.table.vatOrCf')}</TableCell>
                  <TableCell>{t('licenses.table.modules')}</TableCell>
                  <TableCell>{t('licenses.table.usersInstances')}</TableCell>
                  <TableCell>{t('licenses.table.expiry')}</TableCell>
                  <TableCell>{t('licenses.table.status')}</TableCell>
                  <TableCell align="right">{t('licenses.table.actions')}</TableCell>
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
                      <Typography color="text.secondary">{t('licenses.table.empty')}</Typography>
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
                        <Tooltip title={t('licenses.table.view')}>
                          <IconButton size="small" onClick={() => handleViewLicense(license)}>
                            <VisibilityIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title={t('licenses.table.downloadSigned')}>
                          <IconButton
                            size="small"
                            onClick={() => handleDownloadLicense(license.license_id)}
                          >
                            <DownloadIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        {isAdmin && (
                          <Tooltip title={t('licenses.table.delete')}>
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
              labelRowsPerPage={t('licenses.table.rowsPerPage')}
            />
          </TableContainer>
        </>
      )}

      {/* Tab: Verify File */}
      {activeTab === 1 && (
        <Card sx={{ maxWidth: 600 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              {t('licenses.verify.title')}
            </Typography>
            <Typography color="text.secondary" sx={{ mb: 3 }}>
              {t('licenses.verify.subtitle')}
            </Typography>
            
            <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', mb: 3 }}>
              <Button variant="outlined" component="label">
                {t('licenses.verify.selectFile')}
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
              {t('licenses.verify.verifyButton')}
            </Button>
            
            {verifyResult && (
              <Alert
                severity={verifyResult.valid ? 'success' : 'error'}
                sx={{ mt: 3 }}
                icon={verifyResult.valid ? <VerifiedIcon /> : <BlockIcon />}
              >
                <Typography fontWeight={600}>
                  {verifyResult.valid ? t('licenses.verify.valid') : t('licenses.verify.invalid')}
                </Typography>
                <Typography variant="body2">{verifyResult.message}</Typography>
                {verifyResult.valid && verifyResult.license_id && (
                  <Box sx={{ mt: 1 }}>
                    <Typography variant="body2">
                      <strong>{t('licenses.verify.id')}</strong> {verifyResult.license_id}
                    </Typography>
                    <Typography variant="body2">
                      <strong>{t('licenses.verify.customer')}</strong> {verifyResult.customer_name}
                    </Typography>
                    <Typography variant="body2">
                      <strong>{t('licenses.verify.expiry')}</strong> {formatDate(verifyResult.expires_at)}
                    </Typography>
                  </Box>
                )}
              </Alert>
            )}
          </CardContent>
        </Card>
      )}

      {/* Tab: Activation Requests (importate dal file del Portal) */}
      {isAdmin && activeTab === 2 && (
        <Card>
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1, flexWrap: 'wrap', gap: 2 }}>
              <Box>
                <Typography variant="h6">{t('licenses.requests.title')}</Typography>
                <Typography variant="body2" color="text.secondary">
                  {t('licenses.requests.subtitle')}
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button
                  variant="contained"
                  component="label"
                  disabled={importingRequest}
                  startIcon={importingRequest ? <CircularProgress size={16} /> : <AddIcon />}
                >
                  {t('licenses.requests.importButton')}
                  <input
                    type="file"
                    hidden
                    accept=".json"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = '';
                      if (file) handleImportRequestFile(file);
                    }}
                  />
                </Button>
                <Tooltip title={t('licenses.requests.reload')}>
                  <IconButton onClick={loadActivationRequests} disabled={loadingRequests}>
                    <RefreshIcon />
                  </IconButton>
                </Tooltip>
              </Box>
            </Box>

            {requestsError && (
              <Alert severity="error" sx={{ mb: 2 }} onClose={() => setRequestsError(null)}>
                {requestsError}
              </Alert>
            )}

            <TableContainer component={Paper} variant="outlined" sx={{ mt: 2 }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>{t('licenses.requests.table.date')}</TableCell>
                    <TableCell>{t('licenses.requests.table.customer')}</TableCell>
                    <TableCell>{t('licenses.requests.table.app')}</TableCell>
                    <TableCell>{t('licenses.requests.table.requestedModules')}</TableCell>
                    <TableCell>{t('licenses.requests.table.maxUsers')}</TableCell>
                    <TableCell>{t('licenses.requests.table.status')}</TableCell>
                    <TableCell align="right">{t('licenses.requests.table.actions')}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {loadingRequests ? (
                    <TableRow>
                      <TableCell component="td" {...{ colSpan: 7 }} align="center" sx={{ py: 4 }}>
                        <CircularProgress size={24} />
                      </TableCell>
                    </TableRow>
                  ) : activationRequests.length === 0 ? (
                    <TableRow>
                      <TableCell component="td" {...{ colSpan: 7 }} align="center" sx={{ py: 4 }}>
                        <Typography color="text.secondary">{t('licenses.requests.table.empty')}</Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    activationRequests.map((req) => (
                      <TableRow key={req.request_id} hover>
                        <TableCell>{formatDate(req.requested_at)}</TableCell>
                        <TableCell>
                          <Typography variant="body2">{req.customer_name}</Typography>
                          <Typography variant="caption" color="text.secondary">{req.customer_vat_or_cf}</Typography>
                        </TableCell>
                        <TableCell>{req.app_name || req.app_id || '-'}</TableCell>
                        <TableCell>
                          {req.requested_modules && req.requested_modules.length > 0
                            ? req.requested_modules.join(', ')
                            : <Typography variant="caption" color="text.secondary">{t('licenses.requests.table.noneSpecified')}</Typography>}
                        </TableCell>
                        <TableCell>{req.requested_max_users ?? '-'}</TableCell>
                        <TableCell>
                          <Chip
                            label={req.status}
                            size="small"
                            color={REQUEST_STATUS_COLORS[req.status] || 'default'}
                          />
                        </TableCell>
                        <TableCell align="right">
                          {req.status === 'pending' && (
                            <Button size="small" onClick={() => handleUseActivationRequest(req)}>
                              {t('licenses.requests.useForNewLicense')}
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </CardContent>
        </Card>
      )}

      {/* Create License Dialog */}
      <Dialog open={createDialogOpen} onClose={() => setCreateDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>{t('licenses.create.title')}</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            {/* Customer Selection */}
            <Grid item xs={12}>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>{t('licenses.create.customerSection')}</Typography>
            </Grid>
            <Grid item xs={12} md={6}>
              <FormControl fullWidth size="small">
                <InputLabel>{t('licenses.create.selectExistingCustomer')}</InputLabel>
                <Select
                  label={t('licenses.create.selectExistingCustomer')}
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
                {t('licenses.create.orEnterManually')}
              </Typography>
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                label={t('licenses.create.customerName')}
                fullWidth
                size="small"
                value={newLicense.customer_name}
                onChange={(e) => setNewLicense({ ...newLicense, customer_name: e.target.value })}
                required
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                label={t('licenses.create.vatOrCf')}
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
                  <Typography variant="subtitle2" sx={{ mb: 1, mt: 2 }}>{t('licenses.create.modulesAndLimitsSection')}</Typography>
                </Grid>
                <Grid item xs={12}>
                  <FormControl fullWidth size="small">
                    <InputLabel>{t('licenses.create.enabledModules')}</InputLabel>
                    <Select
                      multiple
                      label={t('licenses.create.enabledModules')}
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
                    label={t('licenses.create.maxUsers')}
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
                    label={t('licenses.create.maxInstances')}
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
                <InputLabel>{t('licenses.create.deploymentType')}</InputLabel>
                <Select
                  label={t('licenses.create.deploymentType')}
                  value={newLicense.deployment_type}
                  onChange={(e) => setNewLicense({ ...newLicense, deployment_type: e.target.value })}
                >
                  <MenuItem value="on_prem">{t('licenses.create.deploymentOnPrem')}</MenuItem>
                  <MenuItem value="cloud">{t('licenses.create.deploymentCloud')}</MenuItem>
                  <MenuItem value="hybrid">{t('licenses.create.deploymentHybrid')}</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                label={t('licenses.create.fingerprint')}
                fullWidth
                size="small"
                value={newLicense.fingerprint}
                onChange={(e) => setNewLicense({ ...newLicense, fingerprint: e.target.value })}
                placeholder={t('licenses.create.fingerprintPlaceholder')}
                helperText={t('licenses.create.fingerprintHelper')}
              />
            </Grid>
            
            {/* Validity */}
            <Grid item xs={12}>
              <Typography variant="subtitle2" sx={{ mb: 1, mt: 2 }}>{t('licenses.create.validitySection')}</Typography>
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                label={t('licenses.create.expiresAt')}
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
                label={t('licenses.create.maintenanceUntil')}
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
                    <Typography variant="subtitle2">{t('licenses.create.multiAppToggleTitle')}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {t('licenses.create.multiAppToggleSubtitle')}
                    </Typography>
                  </Box>
                }
              />
            </Grid>
            
            {useMultiApp && (
              <>
                {/* Global Limits */}
                <Grid item xs={12}>
                  <Typography variant="subtitle2" sx={{ mt: 2, mb: 1 }}>{t('licenses.create.globalLimitsSection')}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {t('licenses.create.globalLimitsHelper')}
                  </Typography>
                </Grid>
                <Grid item xs={4}>
                  <TextField
                    label={t('licenses.create.totalUsers')}
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
                    label={t('licenses.create.totalInstances')}
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
                    label={t('licenses.create.totalApps')}
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
                  <Typography variant="subtitle2" sx={{ mt: 2, mb: 1 }}>{t('licenses.create.applicationsSection')}</Typography>
                  {appsError && (
                    <Alert
                      severity="warning"
                      sx={{ mb: 1 }}
                      action={<Button color="inherit" size="small" onClick={loadAppsConfig}>{t('licenses.retry')}</Button>}
                    >
                      {appsError}
                    </Alert>
                  )}
                  <FormControl fullWidth size="small">
                    <InputLabel>{t('licenses.create.addApp')}</InputLabel>
                    <Select
                      label={t('licenses.create.addApp')}
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
                                label={t('licenses.create.appEnabled')}
                              />
                            </Grid>
                            <Grid item xs={12}>
                              <Typography variant="caption" fontWeight={600}>{t('licenses.create.userLimitsPerRole')}</Typography>
                            </Grid>
                            <Grid item xs={4}>
                              <TextField
                                label={t('licenses.create.roleAdmin')}
                                type="number"
                                fullWidth
                                size="small"
                                value={ent.users.admin}
                                onChange={(e) => updateAppUserLimit(appId, 'admin', parseInt(e.target.value) || 0)}
                                inputProps={{ min: -1 }}
                                helperText={t('licenses.create.unlimitedHelper')}
                              />
                            </Grid>
                            <Grid item xs={4}>
                              <TextField
                                label={t('licenses.create.roleStandard')}
                                type="number"
                                fullWidth
                                size="small"
                                value={ent.users.standard}
                                onChange={(e) => updateAppUserLimit(appId, 'standard', parseInt(e.target.value) || 0)}
                                inputProps={{ min: -1 }}
                                helperText={t('licenses.create.unlimitedHelper')}
                              />
                            </Grid>
                            <Grid item xs={4}>
                              <TextField
                                label={t('licenses.create.roleViewer')}
                                type="number"
                                fullWidth
                                size="small"
                                value={ent.users.viewer}
                                onChange={(e) => updateAppUserLimit(appId, 'viewer', parseInt(e.target.value) || 0)}
                                inputProps={{ min: -1 }}
                                helperText={t('licenses.create.unlimitedHelper')}
                              />
                            </Grid>
                            <Grid item xs={6}>
                              <TextField
                                label={t('licenses.create.maxInstances')}
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
                                <InputLabel>{t('licenses.create.appModules')}</InputLabel>
                                <Select
                                  multiple
                                  label={t('licenses.create.appModules')}
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
          <Button onClick={() => setCreateDialogOpen(false)}>{t('common.cancel')}</Button>
          <Button
            variant="contained"
            onClick={handleCreateLicense}
            disabled={!newLicense.customer_name || !newLicense.customer_vat || !newLicense.expires_at}
          >
            {t('licenses.create.createButton')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* View License Dialog */}
      <Dialog open={viewDialogOpen} onClose={() => setViewDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          {t('licenses.view.title')}
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
              
              <Typography variant="subtitle2" color="text.secondary">{t('licenses.view.customer')}</Typography>
              <Typography sx={{ mb: 2 }}>
                {selectedLicense.customer.name}<br />
                <Typography component="span" variant="body2" color="text.secondary">
                  {selectedLicense.customer.vat_or_cf}
                </Typography>
              </Typography>
              
              <Typography variant="subtitle2" color="text.secondary">{t('licenses.view.modules')}</Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 2 }}>
                {selectedLicense.entitlements.modules.map((m) => (
                  <Chip key={m} label={m} size="small" />
                ))}
              </Box>
              
              <Typography variant="subtitle2" color="text.secondary">{t('licenses.view.limits')}</Typography>
              <Typography sx={{ mb: 2 }}>
                {t('licenses.view.maxUsersInstances', {
                  users: selectedLicense.entitlements.max_users,
                  instances: selectedLicense.entitlements.max_instances,
                })}
              </Typography>
              
              <Typography variant="subtitle2" color="text.secondary">{t('licenses.view.deployment')}</Typography>
              <Typography sx={{ mb: 2 }}>
                {selectedLicense.environment.deployment_type}
                {selectedLicense.environment.fingerprint && (
                  <><br />{t('licenses.view.fingerprint', { fingerprint: selectedLicense.environment.fingerprint })}</>
                )}
              </Typography>
              
              <Typography variant="subtitle2" color="text.secondary">{t('licenses.view.validity')}</Typography>
              <Typography>
                {t('licenses.view.issued', { date: formatDate(selectedLicense.validity.issued_at) })}<br />
                {t('licenses.view.expires', { date: formatDate(selectedLicense.validity.expires_at) })}<br />
                {t('licenses.view.maintenanceUntil', { date: formatDate(selectedLicense.validity.maintenance_until) })}
              </Typography>
              
              {/* Multi-App Entitlements */}
              {selectedLicense.apps_entitlements && Object.keys(selectedLicense.apps_entitlements).length > 0 && (
                <>
                  <Divider sx={{ my: 2 }} />
                  <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
                    {t('licenses.view.multiAppEntitlements')}
                  </Typography>
                  {Object.entries(selectedLicense.apps_entitlements).map(([appId, ent]: [string, AppEntitlement]) => {
                    const appInfo = availableApps.find(a => a.id === appId);
                    return (
                      <Box key={appId} sx={{ mb: 2, p: 1.5, bgcolor: 'grey.50', borderRadius: 1 }}>
                        <Typography variant="body2" fontWeight={600}>
                          {appInfo?.name || appId}
                          {!ent.enabled && <Chip label={t('licenses.view.disabled')} size="small" color="warning" sx={{ ml: 1 }} />}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {t('licenses.view.appUsers', {
                            admin: ent.users.admin === -1 ? '∞' : ent.users.admin,
                            standard: ent.users.standard === -1 ? '∞' : ent.users.standard,
                            viewer: ent.users.viewer === -1 ? '∞' : ent.users.viewer,
                          })}
                        </Typography>
                        <br />
                        <Typography variant="caption" color="text.secondary">
                          {t('licenses.view.appInstancesModules', {
                            instances: ent.max_instances,
                            modules: ent.modules?.join(', ') || t('licenses.view.allModules'),
                          })}
                        </Typography>
                      </Box>
                    );
                  })}
                </>
              )}
              
              {selectedLicense.global_limits && (
                <>
                  <Typography variant="subtitle2" color="text.secondary" sx={{ mt: 2 }}>{t('licenses.view.globalLimitsSection')}</Typography>
                  <Typography variant="body2">
                    {t('licenses.view.globalLimitsLine', {
                      users: selectedLicense.global_limits.total_users === -1 ? '∞' : selectedLicense.global_limits.total_users,
                      instances: selectedLicense.global_limits.total_instances === -1 ? '∞' : selectedLicense.global_limits.total_instances,
                      apps: selectedLicense.global_limits.total_apps === -1 ? '∞' : selectedLicense.global_limits.total_apps,
                    })}
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
            {t('licenses.view.downloadSigned')}
          </Button>
          <Button onClick={() => setViewDialogOpen(false)}>{t('common.close')}</Button>
        </DialogActions>
      </Dialog>
    </PramaLayout>
  );
};

export default LicensesPage;
