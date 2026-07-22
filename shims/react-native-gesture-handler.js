import { View, ScrollView, FlatList, Switch, TextInput } from 'react-native';

export const GestureHandlerRootView = View;

export const GestureDetector = ({ children }) => children;
export const Gesture = {
  Tap: () => ({}),
  Pan: () => ({}),
  Pinch: () => ({}),
  Rotation: () => ({}),
  Fling: () => ({}),
  LongPress: () => ({}),
  Simultaneous: (...g) => ({}),
  Race: (...g) => ({}),
  Exclusive: (...g) => ({}),
};

export const TapGestureHandler = View;
export const PanGestureHandler = View;
export const PinchGestureHandler = View;
export const RotationGestureHandler = View;
export const FlingGestureHandler = View;
export const LongPressGestureHandler = View;
export const NativeViewGestureHandler = View;
export const RawButton = View;
export const BaseButton = View;
export const RectButton = View;
export const BorderlessButton = View;
export const TouchableHighlight = View;
export const TouchableNativeFeedback = View;
export const TouchableOpacity = View;
export const TouchableWithoutFeedback = View;
export { ScrollView, FlatList, Switch, TextInput };

export const State = {
  UNDETERMINED: 0,
  FAILED: 1,
  BEGAN: 2,
  CANCELLED: 3,
  ACTIVE: 4,
  END: 5,
};

export const Directions = {
  RIGHT: 1,
  LEFT: 2,
  UP: 4,
  DOWN: 8,
};

export function useAnimatedGestureHandler() { return {}; }
export function createNativeWrapper(Component) { return Component; }
export const gestureHandlerRootHOC = (Component) => Component;
export default {};
