import React from 'react';
import { Text, View, StyleSheet, TextStyle, ViewStyle } from 'react-native';
import { Colors } from '@/constants/colors';

interface Props {
  content: string;
  textStyle?: TextStyle;
  containerStyle?: ViewStyle;
  isUser?: boolean;
}

function renderInline(text: string, baseStyle: TextStyle): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const regex = /(\*\*[^*\n]+\*\*|\*[^*\n]+\*|`[^`\n]+`)/g;
  let lastIndex = 0;
  let match;
  let key = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(<Text key={key++} style={baseStyle}>{text.slice(lastIndex, match.index)}</Text>);
    }
    const raw = match[0];
    if (raw.startsWith('**')) {
      parts.push(<Text key={key++} style={[baseStyle, styles.bold]}>{raw.slice(2, -2)}</Text>);
    } else if (raw.startsWith('*')) {
      parts.push(<Text key={key++} style={[baseStyle, styles.italic]}>{raw.slice(1, -1)}</Text>);
    } else if (raw.startsWith('`')) {
      parts.push(<Text key={key++} style={[baseStyle, styles.code]}>{raw.slice(1, -1)}</Text>);
    }
    lastIndex = match.index + raw.length;
  }
  if (lastIndex < text.length) {
    parts.push(<Text key={key++} style={baseStyle}>{text.slice(lastIndex)}</Text>);
  }
  return parts;
}

export default function MarkdownText({ content, textStyle, containerStyle, isUser }: Props) {
  const base: TextStyle = { ...(isUser ? styles.textUser : styles.textAi), ...textStyle };
  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    const h1 = line.match(/^#{1,2}\s+(.+)/);
    if (h1) {
      elements.push(
        <Text key={i} style={[base, styles.heading]}>{h1[1]}</Text>
      );
      i++;
      continue;
    }

    const numbered = line.match(/^(\d+)\.\s+(.*)/);
    if (numbered) {
      elements.push(
        <View key={i} style={styles.listRow}>
          <Text style={[base, styles.marker]}>{numbered[1]}.</Text>
          <Text style={[base, styles.listContent]}>{renderInline(numbered[2], base)}</Text>
        </View>
      );
      i++;
      continue;
    }

    const bullet = line.match(/^[-•*]\s+(.*)/);
    if (bullet) {
      elements.push(
        <View key={i} style={styles.listRow}>
          <Text style={[base, styles.marker]}>•</Text>
          <Text style={[base, styles.listContent]}>{renderInline(bullet[1], base)}</Text>
        </View>
      );
      i++;
      continue;
    }

    if (line.trim() === '') {
      elements.push(<View key={i} style={styles.spacer} />);
      i++;
      continue;
    }

    elements.push(
      <Text key={i} style={base}>{renderInline(line, base)}</Text>
    );
    i++;
  }

  return <View style={[styles.container, containerStyle]}>{elements}</View>;
}

const styles = StyleSheet.create({
  container: { flexShrink: 1 },
  textAi: {
    fontSize: 14,
    lineHeight: 21,
    color: Colors.text,
    fontFamily: 'Inter_400Regular',
  },
  textUser: {
    fontSize: 14,
    lineHeight: 21,
    color: '#fff',
    fontFamily: 'Inter_400Regular',
  },
  bold: { fontFamily: 'Inter_700Bold', fontWeight: '700' },
  italic: { fontStyle: 'italic' },
  code: {
    fontFamily: 'Inter_400Regular',
    backgroundColor: 'rgba(0,0,0,0.08)',
    borderRadius: 3,
    paddingHorizontal: 4,
    fontSize: 13,
  },
  heading: {
    fontFamily: 'Inter_700Bold',
    fontWeight: '700',
    fontSize: 15,
    marginBottom: 4,
    marginTop: 4,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 2,
    gap: 4,
  },
  marker: {
    minWidth: 20,
    fontSize: 14,
    lineHeight: 21,
    fontFamily: 'Inter_400Regular',
    opacity: 0.7,
  },
  listContent: {
    flex: 1,
    fontSize: 14,
    lineHeight: 21,
    fontFamily: 'Inter_400Regular',
  },
  spacer: { height: 6 },
});
