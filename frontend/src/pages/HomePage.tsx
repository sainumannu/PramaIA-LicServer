import React, { useState, useEffect } from 'react';
import {
  Typography,
  Box,
  Card,
  CardContent,
  CardActionArea,
  Grid,
  Alert,
  CircularProgress,
  Chip,
} from '@mui/material';
import KeyIcon from '@mui/icons-material/Key';
import BusinessIcon from '@mui/icons-material/Business';
import VerifiedIcon from '@mui/icons-material/Verified';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import { PramaLayout } from '../components/PramaLayout';
import { apiClient } from '../services/apiClient';
import { authGuard } from '../services/authGuard';

interface Stats {
  totalLicenses: number;
  activeLicenses: number;
  expiringLicenses: number;
  totalCustomers: number;
}

const HomePage: React.FC = () => {
  const user = authGuard.getCurrentUser();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      // Load licenses and customers to compute stats
      const [licensesData, customersData] = await Promise.all([
        apiClient.get<{ licenses: any[]; total: number }>('/api/licenses/?limit=1000'),
        apiClient.get<{ customers: any[]; total: number }>('/api/customers/?page_size=1'),
      ]);

      const now = new Date();
      const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

      const activeLicenses = licensesData.licenses.filter(l => l.status === 'active').length;
      const expiringLicenses = licensesData.licenses.filter(l => {
        if (l.status !== 'active') return false;
        const expiresAt = new Date(l.validity.expires_at);
        return expiresAt <= thirtyDaysFromNow;
      }).length;

      setStats({
        totalLicenses: licensesData.total,
        activeLicenses,
        expiringLicenses,
        totalCustomers: customersData.total,
      });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const quickLinks = [
    {
      title: 'Gestione Licenze',
      description: 'Crea, visualizza e gestisci le licenze software',
      icon: <KeyIcon sx={{ fontSize: 48 }} />,
      href: '/licenses',
      color: '#10b981',
    },
    {
      title: 'Gestione Clienti',
      description: 'Anagrafica clienti e informazioni di contatto',
      icon: <BusinessIcon sx={{ fontSize: 48 }} />,
      href: '/customers',
      color: '#3b82f6',
    },
    {
      title: 'Verifica Licenze',
      description: 'Verifica l\'autenticità dei file di licenza firmati',
      icon: <VerifiedIcon sx={{ fontSize: 48 }} />,
      href: '/licenses',
      color: '#8b5cf6',
    },
  ];

  return (
    <PramaLayout pageTitle="Dashboard">
      {/* Welcome */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" sx={{ mb: 0.5 }}>
          Benvenuto, {user?.display_name || user?.email || 'Utente'}
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Sistema di gestione licenze PramaIA
        </Typography>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Stats Cards */}
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      ) : stats && (
        <Grid container spacing={3} sx={{ mb: 4 }}>
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Box>
                    <Typography color="text.secondary" variant="body2">
                      Licenze Totali
                    </Typography>
                    <Typography variant="h4" fontWeight={600}>
                      {stats.totalLicenses}
                    </Typography>
                  </Box>
                  <KeyIcon sx={{ fontSize: 40, color: 'text.disabled' }} />
                </Box>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Box>
                    <Typography color="text.secondary" variant="body2">
                      Licenze Attive
                    </Typography>
                    <Typography variant="h4" fontWeight={600} color="success.main">
                      {stats.activeLicenses}
                    </Typography>
                  </Box>
                  <TrendingUpIcon sx={{ fontSize: 40, color: 'success.main' }} />
                </Box>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Box>
                    <Typography color="text.secondary" variant="body2">
                      In Scadenza (30gg)
                    </Typography>
                    <Typography variant="h4" fontWeight={600} color={stats.expiringLicenses > 0 ? 'warning.main' : 'text.primary'}>
                      {stats.expiringLicenses}
                    </Typography>
                  </Box>
                  {stats.expiringLicenses > 0 && (
                    <Chip label="Attenzione" color="warning" size="small" />
                  )}
                </Box>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Box>
                    <Typography color="text.secondary" variant="body2">
                      Clienti
                    </Typography>
                    <Typography variant="h4" fontWeight={600}>
                      {stats.totalCustomers}
                    </Typography>
                  </Box>
                  <BusinessIcon sx={{ fontSize: 40, color: 'text.disabled' }} />
                </Box>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* Quick Links */}
      <Typography variant="h6" sx={{ mb: 2 }}>
        Accesso Rapido
      </Typography>
      <Grid container spacing={3}>
        {quickLinks.map((link) => (
          <Grid item xs={12} sm={6} md={4} key={link.title}>
            <Card sx={{ height: '100%' }}>
              <CardActionArea
                href={link.href}
                sx={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', p: 3 }}
              >
                <Box sx={{ color: link.color, mb: 2 }}>
                  {link.icon}
                </Box>
                <Typography variant="h6" sx={{ mb: 1 }}>
                  {link.title}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {link.description}
                </Typography>
              </CardActionArea>
            </Card>
          </Grid>
        ))}
      </Grid>
    </PramaLayout>
  );
};

export default HomePage;

