import React, { useLayoutEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useExtendedNavigation } from '../../hooks/useExtendedNavigation';
import loc from '../../loc';
import { SettingsScrollView, SettingsSection, SettingsListItem, getSettingsHeaderOptions } from '../../components/platform';
import { useSettings } from '../../hooks/context/useSettings';
import { useTheme } from '../../components/themes';

const Settings = () => {
  const { navigate, setOptions } = useExtendedNavigation();
  const { language } = useSettings(); // Subscribe to language changes to trigger re-render
  const { colors } = useTheme();
  useLayoutEffect(() => {
    setOptions(getSettingsHeaderOptions(loc.settings.header, colors));
  }, [setOptions, language, colors]); // Include language to trigger re-render when language changes

  return (
    <SettingsScrollView testID="SettingsRoot">
      <SettingsSection compact horizontalInset={false} style={styles.quoteSection}>
        <View
          style={[
            styles.quoteCard,
            {
              backgroundColor: colors.lightButton ?? colors.elevated ?? colors.inputBackgroundColor ?? colors.background,
              borderColor: colors.lightBorder ?? colors.formBorder ?? colors.buttonDisabledBackgroundColor ?? colors.background,
            },
          ]}
          testID="SettingsIshmaelQuote"
        >
          <View style={styles.quoteHeaderRow}>
            <View style={[styles.quoteAccent, { backgroundColor: colors.foregroundColor }]} />
            <Text
              style={[
                styles.quoteBadge,
                {
                  color: colors.alternativeTextColor,
                  borderColor: colors.lightBorder ?? colors.formBorder ?? colors.buttonDisabledBackgroundColor ?? colors.background,
                },
              ]}
            >
              MOBY DICK
            </Text>
          </View>
          <View style={styles.quoteBodyRow}>
            <Text style={[styles.quoteMark, { color: colors.alternativeTextColor }]}>“</Text>
            <Text style={[styles.quoteText, { color: colors.foregroundColor }]}>Call me Ishmael.</Text>
            <Text style={[styles.quoteMark, styles.quoteMarkEnd, { color: colors.alternativeTextColor }]}>”</Text>
          </View>
        </View>
      </SettingsSection>

      <SettingsSection horizontalInset={false}>
        <SettingsListItem
          title={loc.settings.general}
          iconName="settings"
          onPress={() => navigate('GeneralSettings')}
          testID="GeneralSettings"
          chevron
          position="first"
        />

        <SettingsListItem
          title={loc.settings.currency}
          iconName="currency"
          onPress={() => navigate('Currency')}
          testID="Currency"
          chevron
          position="middle"
        />

        <SettingsListItem
          title={loc.settings.language}
          iconName="language"
          onPress={() => navigate('Language')}
          testID="Language"
          chevron
          position="middle"
        />

        <SettingsListItem
          title={loc.settings.network}
          iconName="network"
          onPress={() => navigate('NetworkSettings')}
          testID="NetworkSettings"
          chevron
          position="last"
        />
      </SettingsSection>

      <SettingsSection horizontalInset={false}>
        <SettingsListItem
          title={loc.settings.tools}
          iconName="tools"
          onPress={() => navigate('SettingsTools')}
          testID="Tools"
          chevron
          position="single"
        />
      </SettingsSection>

      <SettingsSection horizontalInset={false}>
        <SettingsListItem
          title={loc.settings.about}
          iconName="about"
          onPress={() => navigate('About')}
          testID="AboutButton"
          chevron
          position="single"
        />
      </SettingsSection>
    </SettingsScrollView>
  );
};

export default Settings;

const styles = StyleSheet.create({
  quoteSection: {
    marginTop: -70,
  },
  quoteCard: {
    marginHorizontal: 16,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  quoteHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  quoteAccent: {
    width: 24,
    height: 2,
    borderRadius: 999,
  },
  quoteBadge: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  quoteBodyRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  quoteMark: {
    fontSize: 28,
    lineHeight: 28,
    marginRight: 4,
    marginTop: -2,
  },
  quoteMarkEnd: {
    marginLeft: 4,
    marginRight: 0,
  },
  quoteText: {
    flexShrink: 1,
    fontSize: 21,
    lineHeight: 28,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});
