import { type Component } from 'svelte';

export type ToastType = 'info' | 'success' | 'warning' | 'error';

export interface Toast {
    id: string;
    message: string;
    type: ToastType;
    duration?: number;
    icon?: Component; 
}

class ToastState {
    toasts = $state<Toast[]>([]);

    add(message: string, type: ToastType = 'info', duration = 4000) {
        const id = crypto.randomUUID();
        const toast: Toast = { id, message, type, duration };
        this.toasts.push(toast);

        if (duration > 0) {
            setTimeout(() => {
                this.remove(id);
            }, duration);
        }
    }

    remove(id: string) {
        this.toasts = this.toasts.filter(t => t.id !== id);
    }

    // Convenience methods
    success(msg: string, duration?: number) { this.add(msg, 'success', duration); }
    error(msg: string, duration?: number) { this.add(msg, 'error', duration); }
    info(msg: string, duration?: number) { this.add(msg, 'info', duration); }
    warning(msg: string, duration?: number) { this.add(msg, 'warning', duration); }
}

export const toastStore = new ToastState();
