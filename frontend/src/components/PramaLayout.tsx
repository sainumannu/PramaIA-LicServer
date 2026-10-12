import React from 'react';
import {
  AppBar,
  Toolbar,
  Typography,
  Box,
  Chip,
  IconButton,
  Tooltip,
  Container,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Button,
} from '@mui/material';
import LogoutIcon from '@mui/icons-material/Logout';
import HomeIcon from '@mui/icons-material/Home';
import SettingsIcon from '@mui/icons-material/Settings';
import KeyIcon from '@mui/icons-material/Key';
import BusinessIcon from '@mui/icons-material/Business';
import PaletteIcon from '@mui/icons-material/Palette';
import { useTranslation } from 'react-i18next';
import { authGuard, canAccessSettings } from '../services/authGuard';
import { useThemeContext } from '../shared/ThemeProvider';
import { ThemeName, themeOptions, APP_COLOR } from '../shared/theme';
import { LanguageSwitcher } from './LanguageSwitcher';

// Colori fissi dell'header: non seguono il tema (stesso principio in
// C:/PramaIA-HelpDesk/docs/UI_HEADER.md §1 — l'header resta scuro in Light/Dark/Blue).
const HEADER_TEXT_SECONDARY = 'rgba(255,255,255,0.7)';
const HEADER_SEPARATOR = 'rgba(255,255,255,0.4)';

interface PramaLayoutProps {
  children: React.ReactNode;
  /** Titolo specifico della pagina corrente */
  pageTitle?: string;
}

export const PramaLayout: React.FC<PramaLayoutProps> = ({ children, pageTitle }) => {
  const user = authGuard.getCurrentUser();
  const { themeName, setThemeName } = useThemeContext();
  const { t } = useTranslation();

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <AppBar
        position="sticky"
        elevation={0}
        sx={{
          backgroundColor: 'rgba(26, 26, 46, 0.85)',
          backdropFilter: 'blur(12px)',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        <Toolbar sx={{ gap: 1 }}>
          {/* Home */}
          <Tooltip title={t('header.home')}>
            <IconButton
              component="a"
              href="/"
              size="small"
              sx={{ color: APP_COLOR, mr: 0.5 }}
            >
              <HomeIcon fontSize="small" />
            </IconButton>
          </Tooltip>

          {/* App name */}
          <Typography
            variant="h6"
            sx={{
              background: 'linear-gradient(90deg, #10b981, #06b6d4)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              fontWeight: 800,
              letterSpacing: '-0.5px',
            }}
          >
            {t('header.appName')}
          </Typography>

          {/* Page title breadcrumb */}
          {pageTitle && (
            <>
              <Typography variant="body2" sx={{ color: HEADER_SEPARATOR, mx: 0.5 }}>
                /
              </Typography>
              {/* Bianco fisso: l'header ha sfondo scuro in tutti i temi */}
              <Typography variant="body2" sx={{ color: '#fff' }}>
                {pageTitle}
              </Typography>
            </>
          )}

          {/* Navigation */}
          <Box sx={{ display: 'flex', gap: 1, ml: 3 }}>
            <Button
              component="a"
              href="/licenses"
              size="small"
              startIcon={<KeyIcon />}
              sx={{
                color: HEADER_TEXT_SECONDARY,
                '&:hover': { color: APP_COLOR },
              }}
            >
              {t('header.nav.licenses')}
            </Button>
            <Button
              component="a"
              href="/customers"
              size="small"
              startIcon={<BusinessIcon />}
              sx={{
                color: HEADER_TEXT_SECONDARY,
                '&:hover': { color: APP_COLOR },
              }}
            >
              {t('header.nav.customers')}
            </Button>
          </Box>

          <Box sx={{ flex: 1 }} />

          {/* User chip */}
          {user && (
            <Chip
              label={user.display_name || user.email}
              size="small"
              variant="outlined"
              sx={{ color: '#fff', borderColor: 'rgba(255,255,255,0.3)', height: 28, mr: 1 }}
            />
          )}

          {/* Admin badge */}
          {user?.is_admin && (
            <Chip
              label="Admin"
              size="small"
              sx={{
                backgroundColor: APP_COLOR,
                color: '#1a1a2e',
                fontWeight: 700,
                height: 24,
                fontSize: '0.7rem',
                mr: 1,
              }}
            />
          )}

          {/* Settings (solo per App Admin / Tenant Admin / Global Admin) */}
          {canAccessSettings() && (
            <Tooltip title={t('header.settings')}>
              <IconButton
                component="a"
                href="/settings"
                size="small"
                sx={{ color: HEADER_TEXT_SECONDARY, mr: 0.5 }}
              >
                <SettingsIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}

          {/* Lingua */}
          <LanguageSwitcher />

          <FormControl size="small" sx={{ minWidth: 120, mr: 2 }}>
            <InputLabel id="theme-select-label" sx={{ color: '#fff', '&.Mui-focused': { color: '#fff' } }}>
              {t('header.theme')}
            </InputLabel>
            <Select
              labelId="theme-select-label"
              value={themeName}
              label={t('header.theme')}
              onChange={(event) => setThemeName(event.target.value as ThemeName)}
              renderValue={(value) => (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <PaletteIcon sx={{ fontSize: 18, color: HEADER_TEXT_SECONDARY }} />
                  {themeOptions.find((option) => option.value === value)?.label}
                </Box>
              )}
              sx={{
                color: '#fff',
                fontWeight: 500,
                '.MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.4)' },
                '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.6)' },
                '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: APP_COLOR },
                '.MuiSvgIcon-root': { color: '#fff' },
              }}
            >
              {themeOptions.map((option) => (
                <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>
              ))}
            </Select>
          </FormControl>

          {/* Logout */}
          <Tooltip title={t('header.logout')}>
            <IconButton
              onClick={() => authGuard.logout()}
              sx={{ color: '#ef5350', '&:hover': { backgroundColor: 'rgba(239,68,68,0.1)' } }}
            >
              <LogoutIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Toolbar>
      </AppBar>

      <Box component="main" sx={{ flex: 1, py: 4, backgroundColor: 'background.default' }}>
        <Container maxWidth="xl">{children}</Container>
      </Box>

      <Box
        component="footer"
        sx={{
          py: 2,
          textAlign: 'center',
          borderTop: '1px solid rgba(255,255,255,0.06)',
          backgroundColor: 'background.paper',
        }}
      >
        <Typography variant="caption" color="text.secondary">
          {t('header.footer', { year: new Date().getFullYear() })}
        </Typography>
      </Box>
    </Box>
  );
};

