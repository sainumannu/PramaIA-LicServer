import React, { useState, useEffect, useCallback } from 'react';
import {
  Typography, Box, Card, CardContent, Button, TextField, IconButton,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Paper, Chip, Dialog, DialogTitle, DialogContent, DialogActions,
  FormControl, InputLabel, Select, MenuItem, Grid, Alert, Tooltip,
  TablePagination, InputAdornment, CircularProgress, Switch, FormControlLabel,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import RefreshIcon from '@mui/icons-material/Refresh';
import BusinessIcon from '@mui/icons-material/Business';
import { PramaLayout } from '../components/PramaLayout';
import { apiClient } from '../services/apiClient';
import { authGuard } from '../services/authGuard';

// Types
interface Customer {
  id: number;
  customer_id: string;
  name: string;
  vat_or_cf: string;
  email?: string;
  phone?: string;
  pec?: string;
  address?: string;
  city?: string;
  province?: string;
  postal_code?: string;
  country?: string;
  sdi_code?: string;
  is_active: boolean;
  notes?: string;
  created_at?: string;
  updated_at?: string;
}

interface CustomerListResponse {
  customers: Customer[];
  total: number;
  page: number;
  page_size: number;
}

const CustomersPage: React.FC = () => {
  const user = authGuard.getCurrentUser();
  const isAdmin = user?.is_admin;
  
  // State
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [total, setTotal] = useState(0);
  
  // Dialog states
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [customerToDelete, setCustomerToDelete] = useState<Customer | null>(null);
  
  // Form state
  const [formData, setFormData] = useState({
    name: '',
    vat_or_cf: '',
    email: '',
    phone: '',
    pec: '',
    address: '',
    city: '',
    province: '',
    postal_code: '',
    country: 'Italia',
    sdi_code: '',
    notes: '',
  });

  // Load customers
  const loadCustomers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.append('query', search);
      if (!showInactive) params.append('is_active', 'true');
      params.append('page', (page + 1).toString());
      params.append('page_size', rowsPerPage.toString());
      
      const url = `/api/customers/?${params.toString()}`;
      const data = await apiClient.get<CustomerListResponse>(url);
      
      setCustomers(data.customers);
      setTotal(data.total);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [search, showInactive, page, rowsPerPage]);

  useEffect(() => {
    loadCustomers();
  }, [loadCustomers]);

  // Handlers
  const handleOpenCreate = () => {
    setEditingCustomer(null);
    setFormData({
      name: '',
      vat_or_cf: '',
      email: '',
      phone: '',
      pec: '',
      address: '',
      city: '',
      province: '',
      postal_code: '',
      country: 'Italia',
      sdi_code: '',
      notes: '',
    });
    setDialogOpen(true);
  };

  const handleOpenEdit = (customer: Customer) => {
    setEditingCustomer(customer);
    setFormData({
      name: customer.name,
      vat_or_cf: customer.vat_or_cf,
      email: customer.email || '',
      phone: customer.phone || '',
      pec: customer.pec || '',
      address: customer.address || '',
      city: customer.city || '',
      province: customer.province || '',
      postal_code: customer.postal_code || '',
      country: customer.country || 'Italia',
      sdi_code: customer.sdi_code || '',
      notes: customer.notes || '',
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    try {
      if (editingCustomer) {
        // Update
        await apiClient.put(`/api/customers/${editingCustomer.customer_id}`, {
          name: formData.name,
          email: formData.email || null,
          phone: formData.phone || null,
          pec: formData.pec || null,
          address: formData.address || null,
          city: formData.city || null,
          province: formData.province || null,
          postal_code: formData.postal_code || null,
          country: formData.country || null,
          sdi_code: formData.sdi_code || null,
          notes: formData.notes || null,
        });
        setSuccess('Cliente aggiornato con successo');
      } else {
        // Create
        await apiClient.post('/api/customers/', formData);
        setSuccess('Cliente creato con successo');
      }
      setDialogOpen(false);
      loadCustomers();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleDelete = async () => {
    if (!customerToDelete) return;
    try {
      await apiClient.delete(`/api/customers/${customerToDelete.customer_id}`);
      setSuccess('Cliente eliminato con successo');
      setDeleteDialogOpen(false);
      setCustomerToDelete(null);
      loadCustomers();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('it-IT');
  };

  return (
    <PramaLayout pageTitle="Gestione Clienti">
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

      {/* Toolbar */}
      <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap', alignItems: 'center' }}>
        <TextField
          placeholder="Cerca per nome, P.IVA/CF, email..."
          size="small"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon />
              </InputAdornment>
            ),
          }}
          sx={{ minWidth: 300 }}
        />
        
        <FormControlLabel
          control={
            <Switch
              checked={showInactive}
              onChange={(e) => {
                setShowInactive(e.target.checked);
                setPage(0);
              }}
              size="small"
            />
          }
          label="Mostra inattivi"
        />
        
        <Box sx={{ flex: 1 }} />
        
        <Button
          variant="outlined"
          startIcon={<RefreshIcon />}
          onClick={() => loadCustomers()}
        >
          Aggiorna
        </Button>
        
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={handleOpenCreate}
        >
          Nuovo Cliente
        </Button>
      </Box>

      {/* Table */}
      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>ID Cliente</TableCell>
              <TableCell>Ragione Sociale</TableCell>
              <TableCell>P.IVA / CF</TableCell>
              <TableCell>Email</TableCell>
              <TableCell>Città</TableCell>
              <TableCell>SDI</TableCell>
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
            ) : customers.length === 0 ? (
              <TableRow>
                <TableCell component="td" {...{ colSpan: 8 }} align="center" sx={{ py: 4 }}>
                  <BusinessIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
                  <Typography color="text.secondary">Nessun cliente trovato</Typography>
                </TableCell>
              </TableRow>
            ) : (
              customers.map((customer) => (
                <TableRow key={customer.customer_id} hover>
                  <TableCell>
                    <Typography variant="body2" fontWeight={600}>
                      {customer.customer_id}
                    </Typography>
                  </TableCell>
                  <TableCell>{customer.name}</TableCell>
                  <TableCell>{customer.vat_or_cf}</TableCell>
                  <TableCell>{customer.email || '-'}</TableCell>
                  <TableCell>
                    {customer.city ? `${customer.city}${customer.province ? ` (${customer.province})` : ''}` : '-'}
                  </TableCell>
                  <TableCell>{customer.sdi_code || '-'}</TableCell>
                  <TableCell>
                    <Chip
                      label={customer.is_active ? 'Attivo' : 'Inattivo'}
                      size="small"
                      color={customer.is_active ? 'success' : 'default'}
                    />
                  </TableCell>
                  <TableCell align="right">
                    <Tooltip title="Modifica">
                      <IconButton size="small" onClick={() => handleOpenEdit(customer)}>
                        <EditIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    {isAdmin && (
                      <Tooltip title="Elimina">
                        <IconButton
                          size="small"
                          onClick={() => {
                            setCustomerToDelete(customer);
                            setDeleteDialogOpen(true);
                          }}
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

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>
          {editingCustomer ? 'Modifica Cliente' : 'Nuovo Cliente'}
        </DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            {/* Dati principali */}
            <Grid item xs={12}>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>Dati Principali</Typography>
            </Grid>
            <Grid item xs={12} md={8}>
              <TextField
                label="Ragione Sociale / Nome"
                fullWidth
                size="small"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
            </Grid>
            <Grid item xs={12} md={4}>
              <TextField
                label="P.IVA / Codice Fiscale"
                fullWidth
                size="small"
                value={formData.vat_or_cf}
                onChange={(e) => setFormData({ ...formData, vat_or_cf: e.target.value })}
                required
                disabled={!!editingCustomer}
                helperText={editingCustomer ? 'Non modificabile' : ''}
              />
            </Grid>
            
            {/* Contatti */}
            <Grid item xs={12}>
              <Typography variant="subtitle2" sx={{ mb: 1, mt: 2 }}>Contatti</Typography>
            </Grid>
            <Grid item xs={12} md={4}>
              <TextField
                label="Email"
                type="email"
                fullWidth
                size="small"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
            </Grid>
            <Grid item xs={12} md={4}>
              <TextField
                label="Telefono"
                fullWidth
                size="small"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              />
            </Grid>
            <Grid item xs={12} md={4}>
              <TextField
                label="PEC"
                type="email"
                fullWidth
                size="small"
                value={formData.pec}
                onChange={(e) => setFormData({ ...formData, pec: e.target.value })}
              />
            </Grid>
            
            {/* Indirizzo */}
            <Grid item xs={12}>
              <Typography variant="subtitle2" sx={{ mb: 1, mt: 2 }}>Indirizzo</Typography>
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="Indirizzo"
                fullWidth
                size="small"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              />
            </Grid>
            <Grid item xs={12} md={4}>
              <TextField
                label="Città"
                fullWidth
                size="small"
                value={formData.city}
                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
              />
            </Grid>
            <Grid item xs={6} md={2}>
              <TextField
                label="Provincia"
                fullWidth
                size="small"
                value={formData.province}
                onChange={(e) => setFormData({ ...formData, province: e.target.value })}
                inputProps={{ maxLength: 2 }}
              />
            </Grid>
            <Grid item xs={6} md={3}>
              <TextField
                label="CAP"
                fullWidth
                size="small"
                value={formData.postal_code}
                onChange={(e) => setFormData({ ...formData, postal_code: e.target.value })}
              />
            </Grid>
            <Grid item xs={12} md={3}>
              <TextField
                label="Paese"
                fullWidth
                size="small"
                value={formData.country}
                onChange={(e) => setFormData({ ...formData, country: e.target.value })}
              />
            </Grid>
            
            {/* Fatturazione */}
            <Grid item xs={12}>
              <Typography variant="subtitle2" sx={{ mb: 1, mt: 2 }}>Fatturazione Elettronica</Typography>
            </Grid>
            <Grid item xs={12} md={4}>
              <TextField
                label="Codice SDI"
                fullWidth
                size="small"
                value={formData.sdi_code}
                onChange={(e) => setFormData({ ...formData, sdi_code: e.target.value })}
                inputProps={{ maxLength: 7 }}
                helperText="Codice Destinatario (7 caratteri)"
              />
            </Grid>
            
            {/* Note */}
            <Grid item xs={12}>
              <Typography variant="subtitle2" sx={{ mb: 1, mt: 2 }}>Note</Typography>
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="Note"
                fullWidth
                size="small"
                multiline
                rows={3}
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Annulla</Button>
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={!formData.name || !formData.vat_or_cf}
          >
            {editingCustomer ? 'Salva Modifiche' : 'Crea Cliente'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>Conferma Eliminazione</DialogTitle>
        <DialogContent>
          <Typography>
            Sei sicuro di voler eliminare il cliente <strong>{customerToDelete?.name}</strong>?
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Il cliente verrà disattivato e non sarà più visibile nell'elenco.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Annulla</Button>
          <Button variant="contained" color="error" onClick={handleDelete}>
            Elimina
          </Button>
        </DialogActions>
      </Dialog>
    </PramaLayout>
  );
};

export default CustomersPage;
