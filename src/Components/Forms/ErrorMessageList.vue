<script setup lang="ts">
import type { UseValidator } from "../../Composables/validator.js";

const props = defineProps<{
	validator: UseValidator,
}>();
</script>

<template>
<ul v-if="!props.validator.nestedIsValid?.value">
	<li
		v-for="{ key, errorMessage } in props.validator.nestedErrorMessages?.value ?? []"
		:key="key"
		class="cursor-pointer text-red-500 text-xs hover:underline"
		@click="props.validator.toErrorMessage(key)"
	>
		{{ errorMessage }}
	</li>
</ul>
</template>

<style scoped>

</style>
