import React, { useState } from 'react';
import { IconButton, Tooltip, Menu, MenuItem, ListItemIcon, ListItemText } from '@mui/material';
import LanguageIcon from '@mui/icons-material/Language';
import { useTranslation } from 'react-i18next';
import { SUPPORTED_LANGUAGES, SupportedLanguage, persistLanguage } from '../i18n/i18n';

// Icona fissa (non segue il tema): stesso principio del resto dell'header,
// vedi C:/PramaIA-HelpDesk/docs/UI_HEADER.md §3.8.
const HEADER_TEXT_SECONDARY = 'rgba(255,255,255,0.7)';

const LANGUAGE_FLAGS: Record<SupportedLanguage, string> = {
  it: '🇮🇹',
  en: '🇬🇧',
};

export const LanguageSwitcher: React.FC = () => {
  const { i18n, t } = useTranslation();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

  const currentLanguage = (i18n.language?.slice(0, 2) as SupportedLanguage) || 'it';
  const currentName = t(`language.${currentLanguage}`);

  const handleSelect = (lang: SupportedLanguage) => {
    i18n.changeLanguage(lang);
    persistLanguage(lang);
    setAnchorEl(null);
  };

  return (
    <>
      <Tooltip title={t('language.tooltip', { name: currentName })}>
        <IconButton
          size="small"
          onClick={(e) => setAnchorEl(e.currentTarget)}
          sx={{ color: HEADER_TEXT_SECONDARY, mr: 0.5 }}
        >
          <LanguageIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Menu anchorEl={anchorEl} open={!!anchorEl} onClose={() => setAnchorEl(null)}>
        {SUPPORTED_LANGUAGES.map((lang) => (
          <MenuItem key={lang} selected={lang === currentLanguage} onClick={() => handleSelect(lang)}>
            <ListItemIcon sx={{ fontSize: '1.5rem', minWidth: 32 }}>{LANGUAGE_FLAGS[lang]}</ListItemIcon>
            <ListItemText>{t(`language.${lang}`)}</ListItemText>
          </MenuItem>
        ))}
      </Menu>
    </>
  );
};

export default LanguageSwitcher;
