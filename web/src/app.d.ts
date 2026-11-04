// See https://svelte.dev/docs/kit/types#app.d.ts
declare global {
  namespace App {}

  interface Window {
    google?: {
      accounts: {
        id: {
          initialize(options: {
            client_id: string;
            callback: (response: { credential: string }) => void;
            auto_select?: boolean;
            ux_mode?: 'popup' | 'redirect';
            use_fedcm_for_prompt?: boolean;
          }): void;
          renderButton(
            parent: HTMLElement,
            options: {
              type?: 'standard' | 'icon';
              theme?: 'outline' | 'filled_blue' | 'filled_black';
              size?: 'large' | 'medium' | 'small';
              text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin';
              shape?: 'rectangular' | 'pill' | 'circle' | 'square';
              logo_alignment?: 'left' | 'center';
              width?: number;
            }
          ): void;
          disableAutoSelect(): void;
        };
      };
    };
    /** Cashfree JS SDK v3 (https://sdk.cashfree.com/js/v3/cashfree.js). */
    Cashfree?: (options: { mode: 'sandbox' | 'production' }) => {
      checkout(options: {
        paymentSessionId: string;
        redirectTarget?: '_self' | '_blank' | '_top' | '_modal' | HTMLElement;
      }): Promise<{
        error?: { message?: string; code?: string };
        redirect?: boolean;
        paymentDetails?: { paymentMessage?: string };
      }>;
    };
  }
}

export {};
