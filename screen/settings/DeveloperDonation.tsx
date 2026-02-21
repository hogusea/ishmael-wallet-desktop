import Clipboard from '@react-native-clipboard/clipboard';
import React, { useCallback } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import presentAlert from '../../components/Alert';
import Button from '../../components/Button';
import QRCodeComponent from '../../components/QRCodeComponent';
import { SettingsCard, SettingsScrollView, SettingsSection, SettingsSubtitle } from '../../components/platform';
import { useTheme } from '../../components/themes';
import loc from '../../loc';

const DONATION_ADDRESS = '1LNcsr7uqn2vxhBEy9hV82VGDbcJHauxZh';

const DeveloperDonation: React.FC = () => {
  const { colors } = useTheme();

  const handleCopyAddress = useCallback(() => {
    Clipboard.setString(DONATION_ADDRESS);
    presentAlert({ message: loc.wallets.xpub_copiedToClipboard });
  }, []);

  return (
    <SettingsScrollView contentInsetAdjustmentBehavior="automatic" automaticallyAdjustContentInsets>
      <SettingsSection>
        <SettingsCard style={styles.card}>
          <View style={styles.container}>
            <Text style={[styles.craftedBy, { color: colors.foregroundColor }]}>Crafted by HoguSea</Text>
            <SettingsSubtitle style={[styles.subtitle, { color: colors.alternativeTextColor }]}>BTCmobick Address</SettingsSubtitle>
            <View style={styles.qrContainer}>
              <QRCodeComponent value={DONATION_ADDRESS} size={240} isLogoRendered={false} isMenuAvailable={false} />
            </View>
            <Text selectable style={[styles.address, { color: colors.foregroundColor }]}>
              {DONATION_ADDRESS}
            </Text>
            <View style={styles.copyButton}>
              <Button title={loc.transactions.details_copy} onPress={handleCopyAddress} />
            </View>
          </View>
        </SettingsCard>
      </SettingsSection>
    </SettingsScrollView>
  );
};

export default DeveloperDonation;

const styles = StyleSheet.create({
  card: {
    paddingVertical: 20,
    paddingHorizontal: 16,
  },
  container: {
    alignItems: 'center',
  },
  craftedBy: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  subtitle: {
    marginBottom: 12,
  },
  qrContainer: {
    marginBottom: 16,
  },
  address: {
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 22,
  },
  copyButton: {
    marginTop: 16,
    width: '100%',
  },
});
