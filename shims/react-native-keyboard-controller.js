const React = require('react');
const { View } = require('react-native');

function KeyboardProvider({ children }) { return children; }

module.exports = {
  KeyboardProvider,
  KeyboardAvoidingView: View,
  KeyboardAwareScrollView: require('react-native').ScrollView,
  useReanimatedKeyboardAnimation: () => ({ height: { value: 0 }, progress: { value: 0 } }),
  useKeyboardHandler: () => {},
  useKeyboardContext: () => ({}),
  KeyboardController: { setInputMode: () => {}, resetInputMode: () => {} },
  KeyboardEvents: { addListener: () => ({ remove: () => {} }) },
  AndroidSoftInputModes: {},
  KeyboardStickyView: View,
  KeyboardToolbar: () => null,
  OverKeyboardView: View,
  defaultKeyboardToolbarTheme: {},
  useKeyboardAnimation: () => ({ height: { value: 0 }, progress: { value: 0 } }),
};
