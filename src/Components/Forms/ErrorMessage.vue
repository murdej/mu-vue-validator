<script setup lang="ts">
import { onMounted, ref } from "vue";
import { UseValidator } from "../../Composables/validator.js";

interface Props {
  validator: UseValidator,
  errorMessageClass?: string,
}
const props = defineProps<Props>();
const element = ref();
onMounted(() => props.validator.setErrorMessage(element.value));
</script>

<template>
  <span v-if="props.validator.hasError.value" :class="props.errorMessageClass ?? props.validator.errorMessageClass" ref="element">
    {{ props.validator.errorMessage }}
  </span>
</template>

<style>
@keyframes error-bounce {
  0%, 100% { transform: translateY(0); }
  20%       { transform: translateY(-6px); }
  40%       { transform: translateY(0); }
  60%       { transform: translateY(-4px); }
  80%       { transform: translateY(0); }
}
.error-bounce {
  animation: error-bounce 0.5s ease;
}
</style>
