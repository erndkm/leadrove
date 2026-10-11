import type { Coordinate, MapMessage } from '../services/map-selection';

export type LocationMapProps = {
  center: Coordinate;
  selected: Coordinate | null;
  radiusMeters: number;
  dark: boolean;
  onEvent: (event: MapMessage) => void;
  onError: () => void;
};
