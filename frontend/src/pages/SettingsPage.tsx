import React, { useState } from 'react';
import {
  Box,
  Typography,
  Container,
  Tabs,
  Tab,
  Paper,
} from '@mui/material';
import SettingsIcon from '@mui/icons-material/Settings';
import PeopleIcon from '@mui/icons-material/People';
import TuneIcon from '@mui/icons-material/Tune';
import { useTranslation } from 'react-i18next';
import { PramaLayout } from '../components/PramaLayout';
import { UsersPanel } from '../components/UsersPanel';
import { canAccessSettings } from '../services/authGuard';
import { Navigate } from 'react-router-dom';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel({ children, value, index }: TabPanelProps) {
  return (
    <div role="tabpanel" hidden={value !== index}>
      {value === index && <Box sx={{ py: 3 }}>{children}</Box>}
    </div>
  );
}

export const SettingsPage: React.FC = () => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState(0);

  // Verifica accesso
  if (!canAccessSettings()) {
    return <Navigate to="/" replace />;
  }

  return (
    <PramaLayout pageTitle={t('settings.pageTitle')}>
      <Container maxWidth="lg">
        {/* Header */}
        <Box sx={{ mb: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
            <SettingsIcon sx={{ fontSize: 28, color: 'primary.main' }} />
            <Typography variant="h4" sx={{ fontWeight: 600 }}>
              {t('settings.title')}
            </Typography>
          </Box>
          <Typography variant="body2" color="text.secondary">
            {t('settings.subtitle')}
          </Typography>
        </Box>

        {/* Tabs */}
        <Paper sx={{ mb: 3 }}>
          <Tabs
            value={activeTab}
            onChange={(_, v) => setActiveTab(v)}
            variant="scrollable"
            scrollButtons="auto"
            sx={{
              borderBottom: 1,
              borderColor: 'divider',
              '& .MuiTab-root': {
                textTransform: 'none',
                minHeight: 56,
                fontWeight: 500,
              },
            }}
          >
            <Tab
              icon={<PeopleIcon fontSize="small" />}
              iconPosition="start"
              label={t('settings.tabs.users')}
            />
            <Tab
              icon={<TuneIcon fontSize="small" />}
              iconPosition="start"
              label={t('settings.tabs.config')}
            />
          </Tabs>

          {/* Tab: Utenti */}
          <TabPanel value={activeTab} index={0}>
            <UsersPanel />
          </TabPanel>

          {/* Tab: Configurazione (placeholder per lo sviluppatore) */}
          <TabPanel value={activeTab} index={1}>
            <Box sx={{ p: 3, textAlign: 'center' }}>
              <Typography variant="h6" color="text.secondary" gutterBottom>
                {t('settings.configPlaceholder.title')}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {t('settings.configPlaceholder.body')}
              </Typography>
              <Typography variant="caption" color="text.disabled" sx={{ mt: 2, display: 'block' }}>
                {t('settings.configPlaceholder.note')}
              </Typography>
            </Box>
          </TabPanel>
        </Paper>
      </Container>
    </PramaLayout>
  );
};

export default SettingsPage;

