<script lang="ts">
    let { title, description } = $props<{
        title: string;
        description: string;
    }>();
</script>

<header class="mb-10 text-left">
    <h1 class="text-3xl font-light tracking-tight mb-3 text-base-content">
        {title}
    </h1>
    <p class="text-base text-base-content/50 font-light leading-relaxed">
        {description}
    </p>
</header>
