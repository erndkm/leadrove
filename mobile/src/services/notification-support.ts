import { Platform } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';

// SDK 57 initializes push listeners when expo-notifications is imported.
// Android Expo Go throws at that boundary even for local-only consumers.
export function notificationsSupported() {
  return Platform.OS !== 'web' && !(Platform.OS === 'android' &&
    (Constants.appOwnership === 'expo' || Constants.executionEnvironment === ExecutionEnvironment.StoreClient));
}
