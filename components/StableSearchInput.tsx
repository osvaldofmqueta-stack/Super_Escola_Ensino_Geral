import React from 'react';
import { TextInput, TouchableOpacity } from 'react-native';
import type { StyleProp, TextStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/colors';

export interface StableSearchInputProps {
  value: string;
  onChangeText: (text: string) => void;
  onClear?: () => void;
  placeholder?: string;
  inputStyle?: StyleProp<TextStyle>;
  iconSize?: number;
  iconColor?: string;
  clearIconSize?: number;
  iconName?: keyof typeof Ionicons.glyphMap;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  returnKeyType?: 'done' | 'go' | 'next' | 'search' | 'send';
  showClearIcon?: boolean;
  showLeadingIcon?: boolean;
  multiline?: boolean;
  nativeID?: string;
  editable?: boolean;
}

const StableSearchInputBase = React.forwardRef<TextInput, StableSearchInputProps>(function StableSearchInputBase({
  value,
  onChangeText,
  onClear,
  placeholder,
  inputStyle,
  iconSize = 16,
  iconColor,
  clearIconSize,
  iconName = 'search-outline',
  autoCapitalize = 'none',
  returnKeyType = 'search',
  showClearIcon = true,
  showLeadingIcon = true,
  nativeID = 'search-input',
  editable = true,
}, ref) {
  const color = iconColor ?? Colors.textMuted;
  const handleClear = onClear ?? (() => onChangeText(''));
  return (
    <>
      {showLeadingIcon && (
        <Ionicons name={iconName} size={iconSize} color={color} />
      )}
      <TextInput
        ref={ref}
        nativeID={nativeID}
        style={inputStyle}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={color}
        autoCapitalize={autoCapitalize}
        returnKeyType={returnKeyType}
        clearButtonMode="while-editing"
        editable={editable}
      />
      {showClearIcon && value.length > 0 && (
        <TouchableOpacity onPress={handleClear} activeOpacity={0.7}>
          <Ionicons name="close-circle" size={clearIconSize ?? iconSize} color={color} />
        </TouchableOpacity>
      )}
    </>
  );
});

export const StableSearchInput = React.memo(StableSearchInputBase);
export default StableSearchInput;
