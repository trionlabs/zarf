<script lang="ts">
    import type { ComponentType } from 'svelte';

    let {
        icon: Icon,
        title,
        description,
        color = 'bg-zen-fg/5',
        iconColor = 'text-zen-fg/60',
        action,
    }: {
        icon: ComponentType;
        title: string;
        description: string;
        color?: string;
        iconColor?: string;
        action?: any;
    } = $props();
</script>

<div
    class="flex flex-col items-center justify-center py-20 text-center animate-in fade-in zoom-in duration-300"
>
    <!-- Premium Multi-layered Icon Container -->
    <div class="relative mb-6 flex items-center justify-center group">
        <!-- Ambient Blur Glow -->
        <div class="absolute w-24 h-24 rounded-full {color} blur-2xl opacity-60 group-hover:opacity-80 transition-colors duration-500 animate-pulse-glow"></div>
        
        <!-- Yüzen Dış Halka (Floating Outer Ring) -->
        <div class="w-20 h-20 rounded-full border border-zen-border flex items-center justify-center relative transition-all duration-500 group-hover:scale-105 group-hover:border-zen-fg/20 animate-float">
            <!-- İç İkon Yuvası (Inner Glassmorphic Well) -->
            <div class="w-14 h-14 rounded-full flex items-center justify-center shadow-sm bg-zen-bg-elevated/80 backdrop-blur-md border border-zen-border-subtle transition-colors duration-300 group-hover:bg-zen-bg-elevated">
                <Icon class="w-6 h-6 {iconColor} transition-transform duration-300 group-hover:scale-110" />
            </div>
            
            <!-- Küçük Tasarım Detayı (Accent Dot) -->
            <span class="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-zen-fg/40 border border-zen-bg animate-pulse"></span>
        </div>
    </div>

    <h2 class="font-medium text-lg mb-2 tracking-tight text-zen-fg">
        {title}
    </h2>
    <p class="text-sm text-zen-fg-subtle max-w-sm mb-6 leading-relaxed">
        {description}
    </p>
    {#if action}
        <div class="animate-in fade-in slide-in-from-bottom-2 delay-100 duration-500">
            {@render action()}
        </div>
    {/if}
</div>

<style>
    @keyframes float {
        0%, 100% {
            transform: translateY(0px);
        }
        50% {
            transform: translateY(-5px);
        }
    }
    
    @keyframes pulse-glow {
        0%, 100% {
            opacity: 0.4;
            transform: scale(0.92);
        }
        50% {
            opacity: 0.7;
            transform: scale(1.08);
        }
    }

    .animate-float {
        animation: float 4s ease-in-out infinite;
    }

    .animate-pulse-glow {
        animation: pulse-glow 3s ease-in-out infinite;
    }
</style>
