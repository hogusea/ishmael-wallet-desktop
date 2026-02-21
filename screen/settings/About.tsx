import Clipboard from '@react-native-clipboard/clipboard';
import React, { useCallback } from 'react';
import { Linking, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { getApplicationName, getBuildNumber, getBundleId, getUniqueIdSync, getVersion } from 'react-native-device-info';
import Icon from 'react-native-vector-icons/FontAwesome5';

import A from '../../blue_modules/analytics';
import { BlueTextCentered } from '../../BlueComponents';
import { BlueSpacing20 } from '../../components/BlueSpacing';
import {
  SettingsCard,
  SettingsFlatList,
  SettingsListItem,
  SettingsListItemProps,
  SettingsSection,
  SettingsSectionHeader,
} from '../../components/platform';
import { useTheme } from '../../components/themes';
import { useExtendedNavigation } from '../../hooks/useExtendedNavigation';
import loc from '../../loc';

const branch = require('../../current-branch.json');

interface AboutItem extends SettingsListItemProps {
  id: string;
  section?: number;
  customContent?: React.ReactNode;
}

const About: React.FC = () => {
  const { navigate } = useExtendedNavigation();
  const { width, height } = useWindowDimensions();
  const { colors } = useTheme();

  const handleOnReleaseNotesPress = useCallback(() => {
    navigate('ReleaseNotes');
  }, [navigate]);

  const handleOnDeveloperDonationPress = useCallback(() => {
    navigate('DeveloperDonation');
  }, [navigate]);

  const handleOnLicensingPress = useCallback(() => {
    navigate('Licensing');
  }, [navigate]);

  const handleOnGithubPress = useCallback(() => {
    Linking.openURL('https://github.com/hogusea');
  }, []);

  const buildNumber = getBuildNumber();
  const buildNumberAsTimestamp = Number(buildNumber);
  const buildDate =
    Number.isFinite(buildNumberAsTimestamp) && buildNumberAsTimestamp > 1000000000
      ? new Date(buildNumberAsTimestamp * 1000).toUTCString()
      : new Date().toUTCString();

  const aboutItems = useCallback((): AboutItem[] => {
    const items: AboutItem[] = [
      {
        id: 'developerDonation',
        title: '개발자 후원하기',
        iconName: 'paperPlane',
        chevron: true,
        onPress: handleOnDeveloperDonationPress,
        section: 1,
      },
      {
        id: 'releaseNotes',
        title: loc.settings.about_release_notes,
        iconName: 'releaseNotes',
        chevron: true,
        onPress: handleOnReleaseNotesPress,
        section: 1,
      },
      {
        id: 'licensing',
        title: loc.settings.about_license,
        iconName: 'licensing',
        chevron: true,
        onPress: handleOnLicensingPress,
        section: 1,
      },
      {
        id: 'github',
        title: loc.settings.about_sm_github,
        leftIcon: <Icon name="github" size={24} color={colors.foregroundColor} />,
        onPress: handleOnGithubPress,
        section: 1,
      },
      {
        id: 'builtWith',
        title: '',
        customContent: (
          <SettingsSection compact>
            <SettingsCard style={[styles.card, styles.builtWithCard]}>
              <BlueTextCentered>{loc.settings.about_awesome} 👍</BlueTextCentered>
              <BlueSpacing20 />
              <BlueTextCentered>React Native</BlueTextCentered>
              <BlueTextCentered>bitcoinjs-lib</BlueTextCentered>
              <BlueTextCentered>Nodejs</BlueTextCentered>
              <BlueTextCentered>Electrum server</BlueTextCentered>
            </SettingsCard>
          </SettingsSection>
        ),
        section: 1.5,
      },
      {
        id: 'footer',
        title: '',
        customContent: (
          <View style={styles.footerContainer}>
            <BlueSpacing20 />
            <Text style={[styles.footerText, { color: colors.alternativeTextColor }]}>
              {getApplicationName()} ver {getVersion()} (build {buildNumber + ' ' + branch})
            </Text>
            <Text style={[styles.footerText, { color: colors.alternativeTextColor }]}>{buildDate}</Text>
            <Text style={[styles.footerText, { color: colors.alternativeTextColor }]}>{getBundleId()}</Text>
            <Text style={[styles.footerText, { color: colors.alternativeTextColor }]}>
              w, h = {width}, {height}
            </Text>
            <Text style={[styles.footerText, { color: colors.alternativeTextColor }]}>Unique ID: {getUniqueIdSync()}</Text>
            <View style={styles.copyToClipboard}>
              <TouchableOpacity
                accessibilityRole="button"
                onPress={() => {
                  const stringToCopy = 'userId:' + getUniqueIdSync();
                  A.logError('copied unique id');
                  Clipboard.setString(stringToCopy);
                }}
              >
                <Text style={[styles.copyToClipboardText, { color: colors.foregroundColor }]}>{loc.transactions.details_copy}</Text>
              </TouchableOpacity>
            </View>
            <BlueSpacing20 />
          </View>
        ),
        section: 2,
      },
    ];
    return items;
  }, [
    colors.foregroundColor,
    colors.alternativeTextColor,
    handleOnGithubPress,
    handleOnDeveloperDonationPress,
    handleOnReleaseNotesPress,
    handleOnLicensingPress,
    buildNumber,
    buildDate,
    width,
    height,
  ]);

  const renderItem = useCallback(
    (props: { item: AboutItem }) => {
      const { id, section, customContent, ...listItemProps } = props.item;

      if (customContent) {
        return <>{customContent}</>;
      }

      if (listItemProps.title && !listItemProps.leftIcon && !listItemProps.onPress && section) {
        return <SettingsSectionHeader title={listItemProps.title} />;
      }

      const currentSection = Math.floor(section || 0);
      const sectionItems = aboutItems().filter(
        i => Math.floor(i.section || 0) === currentSection && !i.customContent && (i.onPress || i.leftIcon || i.chevron || i.subtitle),
      );
      const indexInSection = sectionItems.findIndex(i => i.id === id);
      const isFirstInSection = indexInSection === 0;
      const isLastInSection = indexInSection === sectionItems.length - 1;
      const position = isFirstInSection && isLastInSection ? 'single' : isFirstInSection ? 'first' : isLastInSection ? 'last' : 'middle';

      return <SettingsListItem {...listItemProps} position={position} />;
    },
    [aboutItems],
  );

  const keyExtractor = useCallback((item: AboutItem, index: number) => `${item.id}-${index}`, []);

  const ListFooterComponent = useCallback(() => <View style={styles.sectionSpacing} />, []);

  return (
    <SettingsFlatList
      data={aboutItems()}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      testID="AboutScrollView"
      ListFooterComponent={ListFooterComponent}
      contentInsetAdjustmentBehavior="automatic"
      automaticallyAdjustContentInsets
      removeClippedSubviews
    />
  );
};

export default About;

const styles = StyleSheet.create({
  sectionSpacing: {
    height: 16,
  },
  card: {
    marginVertical: 8,
  },
  builtWithCard: {
    paddingVertical: 16,
  },
  footerContainer: {
    marginTop: 16,
  },
  footerText: {
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 4,
  },
  copyToClipboard: {
    marginTop: 8,
    alignItems: 'center',
  },
  copyToClipboardText: {
    fontSize: 12,
  },
});
