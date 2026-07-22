import React, { Component, ComponentType, PropsWithChildren } from "react";
import { ErrorFallback, ErrorFallbackProps } from "@/components/ErrorFallback";

export type ErrorBoundaryProps = PropsWithChildren<{
  FallbackComponent?: ComponentType<ErrorFallbackProps>;
  onError?: (error: Error, stackTrace: string) => void;
}>;

type ErrorBoundaryState = { error: Error | null; isRecovering: boolean };

/**
 * This is a special case for for using the class components. Error boundaries must be class components because React only provides error boundary functionality through lifecycle methods (componentDidCatch and getDerivedStateFromError) which are not available in functional components.
 * https://react.dev/reference/react/Component#catching-rendering-errors-with-an-error-boundary
 */

// Alguns erros são causados por uma corrida transitória de arranque entre o
// expo-router/react-navigation a montar o navegador e o redireccionamento
// inicial (auth/licença) a resolver — o "state.routes" interno fica
// momentaneamente undefined e uma nova renderização resolve sozinha.
// Detectamos esta assinatura e tentamos UMA vez, silenciosamente. Se o
// mesmo erro voltar a acontecer depois dessa tentativa, mostramos sempre o
// ecrã de erro — nunca ficamos a ocultar um erro persistente (isso deixava
// a aplicação "presa" a processar sem mostrar nada ao utilizador).
function isProvavelmenteCorridaDeArranque(error: Error): boolean {
  const msg = error?.message || '';
  return /Cannot read properties of undefined \(reading '0'\)/.test(msg);
}

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null, isRecovering: false };
  private autoRetryUsed = false;
  private recoveryTimer: ReturnType<typeof setTimeout> | null = null;

  static defaultProps: {
    FallbackComponent: ComponentType<ErrorFallbackProps>;
  } = {
    FallbackComponent: ErrorFallback,
  };

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }): void {
    const msg = `${error?.name}: ${error?.message}\n\nStack: ${error?.stack}\n\nComponent: ${info?.componentStack}`;
    console.error("[ErrorBoundary] Caught error:", msg);
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem('@siga_last_error', msg);
      }
    } catch {}
    if (typeof this.props.onError === "function") {
      this.props.onError(error, info.componentStack);
    }
    // Só tentamos a recuperação silenciosa uma única vez por sessão. Se o
    // erro persistir depois disso, deixamos cair para o ecrã de erro normal
    // (com botão "Tentar novamente") em vez de ocultar tudo indefinidamente.
    if (!this.autoRetryUsed && isProvavelmenteCorridaDeArranque(error)) {
      this.autoRetryUsed = true;
      console.warn('[ErrorBoundary] Erro compatível com corrida de arranque da navegação — a tentar recuperar automaticamente uma vez.');
      this.setState({ isRecovering: true });
      this.recoveryTimer = setTimeout(() => {
        this.recoveryTimer = null;
        this.setState({ error: null, isRecovering: false });
      }, 30);
    } else {
      this.setState({ isRecovering: false });
    }
  }

  componentWillUnmount(): void {
    if (this.recoveryTimer) clearTimeout(this.recoveryTimer);
  }

  resetError = (): void => {
    this.setState({ error: null, isRecovering: false });
  };

  render() {
    const { FallbackComponent } = this.props;

    // Enquanto a recuperação automática silenciosa está em curso, não mostrar
    // o ecrã de erro — o timer acima vai limpar o erro de imediato. Se o erro
    // persistir (isRecovering já usado e error ainda presente), mostramos o
    // ecrã de erro normalmente para o utilizador não ficar "preso".
    if (this.state.error && this.state.isRecovering) {
      return this.props.children;
    }

    return this.state.error && FallbackComponent ? (
      <FallbackComponent
        error={this.state.error}
        resetError={this.resetError}
      />
    ) : (
      this.props.children
    );
  }
}
