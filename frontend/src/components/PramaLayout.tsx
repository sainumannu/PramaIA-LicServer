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
import { authGuard, canAccessSettings } from '../services/authGuard';
import { useThemeContext } from '../shared/ThemeProvider';
import { ThemeName, themeOptions } from '../shared/theme';

interface PramaLayoutProps {
  children: React.ReactNode;
  /** Titolo specifico della pagina corrente */
  pageTitle?: string;
}

export const PramaLayout: React.FC<PramaLayoutProps> = ({ children, pageTitle }) => {
  const user = authGuard.getCurrentUser();
  const PORTAL_URL = process.env.REACT_APP_PORTAL_URL || 'http://localhost:3080';
  const { themeName, setThemeName } = useThemeContext();

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <AppBar
        position="sticky"
        elevation={0}
        sx={{
          backgroundColor: 'rgba(26, 26, 46, 0.9)',
          backdropFilter: 'blur(12px)',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        <Toolbar sx={{ gap: 1 }}>
          {/* Torna al Portal */}
          <Tooltip title="Back to PramaIA Portal">
            <IconButton
              component="a"
              href={PORTAL_URL}
              size="small"
              sx={{ color: 'text.secondary', mr: 0.5 }}
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
            PramaIA Licensing Server
          </Typography>

          {/* Page title breadcrumb */}
          {pageTitle && (
            <>
              <Typography variant="body2" color="text.secondary" sx={{ mx: 0.5 }}>
                /
              </Typography>
              <Typography variant="body2" color="text.primary">
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
                color: 'text.secondary',
                '&:hover': { color: 'primary.main' },
              }}
            >
              Licenze
            </Button>
            <Button
              component="a"
              href="/customers"
              size="small"
              startIcon={<BusinessIcon />}
              sx={{ 
                color: 'text.secondary',
                '&:hover': { color: 'primary.main' },
              }}
            >
              Clienti
            </Button>
          </Box>

          <Box sx={{ flex: 1 }} />

          {/* User chip */}
          {user && (
            <Chip
              label={user.display_name || user.email}
              size="small"
              variant="outlined"
              sx={{ borderColor: 'rgba(255,255,255,0.2)', mr: 1 }}
            />
          )}

          {/* Admin badge */}
          {user?.is_admin && (
            <Chip
              label="Admin"
              size="small"
              color="primary"
              sx={{ mr: 1, height: 20, fontSize: '0.65rem' }}
            />
          )}

          <FormControl size="small" sx={{ minWidth: 120, mr: 2 }}>
            <InputLabel id="theme-select-label" sx={{ color: '#fff', '&.Mui-focused': { color: '#fff' } }}>
              Theme
            </InputLabel>
            <Select
              labelId="theme-select-label"
              value={themeName}
              label="Theme"
              onChange={(event) => setThemeName(event.target.value as ThemeName)}
              sx={{
                color: '#fff',
                fontWeight: 500,
                '.MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.6)' },
                '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#fff' },
                '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#10b981' },
                '.MuiSvgIcon-root': { color: '#fff' },
              }}
            >
              {themeOptions.map((option) => (
                <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>
              ))}
            </Select>
          </FormControl>

          {/* Settings (solo per App Admin / Tenant Admin / Global Admin) */}
          {canAccessSettings() && (
            <Tooltip title="Impostazioni">
              <IconButton
                component="a"
                href="/settings"
                size="small"
                sx={{ color: 'text.secondary', mr: 0.5 }}
              >
                <SettingsIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}

          {/* Logout */}
          <Tooltip title="Logout">
            <IconButton onClick={() => authGuard.logout()} size="small" sx={{ color: 'text.secondary' }}>
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
          PramaIA Licensing Server · PramaIA Platform © {new Date().getFullYear()}
        </Typography>
      </Box>
    </Box>
  );
};

