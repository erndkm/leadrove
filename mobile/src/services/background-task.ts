import { Platform } from "react-native";
import "./notification-handler";
import * as TaskManager from "expo-task-manager";
import type { LocationObject } from "expo-location";
import {
  handleLocations,
  LOCATION_TASK,
  reportBackgroundError,
} from "../store/app-store";
if (Platform.OS !== "web" && !TaskManager.isTaskDefined(LOCATION_TASK))
  TaskManager.defineTask<{ locations: LocationObject[] }>(
    LOCATION_TASK,
    async ({ data, error }) => {
      if (error) {
        await reportBackgroundError(error);
        return;
      }
      await handleLocations(data?.locations ?? []);
    },
  );
