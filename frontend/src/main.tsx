import { RouterProvider } from "@tanstack/react-router";
import { ThemeProvider } from "next-themes";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { Toaster } from "@/components/ui/sonner";
import { AppQueryProvider } from "@/lib/query/provider";
import { router } from "@/router";

import "./index.css";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Missing #root element; check index.html.");
}

createRoot(rootElement).render(
  <StrictMode>
    {/* next-themes drives the `.dark` class that index.css keys off, and the
        sonner Toaster reads the resolved theme through useTheme(). */}
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <AppQueryProvider>
        <RouterProvider router={router} />
        <Toaster position="top-center" />
      </AppQueryProvider>
    </ThemeProvider>
  </StrictMode>,
);
