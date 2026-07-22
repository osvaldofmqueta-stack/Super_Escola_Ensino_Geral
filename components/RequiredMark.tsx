import React from 'react';
import { Text, Platform } from 'react-native';
import { Colors } from '@/constants/colors';
import { showToast } from '@/utils/toast';

interface Props {
  hint?: string;
}

const DEFAULT_HINT = 'Campo obrigatório';

export default function RequiredMark({ hint = DEFAULT_HINT }: Props) {
  const webProps =
    Platform.OS === 'web'
      ? ({
          // RN-Web forwards `title` to the underlying span → native browser tooltip on hover.
          title: hint,
          accessibilityLabel: hint,
        } as any)
      : {
          accessibilityLabel: hint,
          accessibilityRole: 'text' as const,
          onPress: () => showToast(hint, 'info', 2000),
        };

  return (
    <Text
      {...webProps}
      style={{
        color: Colors.danger,
        fontFamily: 'Inter_700Bold',
        fontSize: 13,
        marginLeft: 2,
        ...(Platform.OS === 'web' ? ({ cursor: 'help' } as any) : {}),
      }}
    >
      {' *'}
    </Text>
  );
}
