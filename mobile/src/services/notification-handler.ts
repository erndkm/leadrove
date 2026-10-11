import { notificationsSupported } from './notification-support';

if (notificationsSupported()) {
const Notifications: typeof import('expo-notifications') = require('expo-notifications');
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});
}
