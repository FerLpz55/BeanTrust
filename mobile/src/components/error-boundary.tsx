/** ErrorBoundary de desarrollo/UI: cualquier error de render se muestra en
 * pantalla (fondo con color) en lugar de un blanco ciego. */

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useThemeColor } from '@/src/hooks/use-theme-color';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

// Componente funcional aparte: las clases no pueden usar hooks (useThemeColor).
function ErrorFallback({ message }: { message: string }) {
  const errorContainer = useThemeColor('errorContainer');
  const onErrorContainer = useThemeColor('onErrorContainer');
  return (
    <View style={[styles.container, { backgroundColor: errorContainer }]}>
      <Text style={[styles.title, { color: onErrorContainer }]}>Algo salió mal</Text>
      <Text style={[styles.message, { color: onErrorContainer }]}>{message}</Text>
    </View>
  );
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[boundary] error de render:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return <ErrorFallback message={this.state.error.message} />;
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
  },
  message: {
    fontSize: 14,
    textAlign: 'center',
  },
});