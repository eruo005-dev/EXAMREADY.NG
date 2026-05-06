'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider as NextThemesProvider } from 'next-themes';
import { useState, type ReactNode } from 'react';

import { Toast, ToastClose, ToastDescription, ToastProvider, ToastTitle, ToastViewport, useToast } from '@examready/ui';

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            // Nigerian network reality: failed queries should retry, but
            // not indefinitely. Two retries with exponential backoff.
            retry: 2,
            refetchOnWindowFocus: false,
          },
          mutations: {
            retry: 0,
          },
        },
      }),
  );

  return (
    <NextThemesProvider attribute="class" defaultTheme="system" enableSystem>
      <QueryClientProvider client={client}>
        <ToastProvider>
          {children}
          <Toaster />
          <ToastViewport />
        </ToastProvider>
      </QueryClientProvider>
    </NextThemesProvider>
  );
}

function Toaster() {
  const { toasts } = useToast();
  return (
    <>
      {toasts.map(({ id, title, description, action, ...props }) => (
        <Toast key={id} {...props}>
          <div className="grid gap-1">
            {title && <ToastTitle>{title}</ToastTitle>}
            {description && <ToastDescription>{description}</ToastDescription>}
          </div>
          {action}
          <ToastClose />
        </Toast>
      ))}
    </>
  );
}
