import { type ObjectSchema, type SchemaDescription, reach, ValidationError } from "yup";
import { computed, type ComputedRef, reactive, type Ref, ref, unref, watch } from "vue";
import type { NestedPath } from "../Utils/types.js";


interface ValidatorOptions {
	inputErrorClass: string|null,
	inputRequiredClass: string|null,
}

interface ValidatorShared<TE extends string = string> {
	errorMessageElements: Record<string, HTMLElement>;
	yupErrors: Ref<Record<string, string>>;
	extraErrors: Partial<Record<TE, string>>;
	store: Partial<Record<string, Validator<any>>>;
	options: ValidatorOptions;
	touched: Record<string, boolean>;
	submitted: Ref<boolean>;
}

/**
 * Creates a root `Validator` instance bound to a reactive form data object and a yup schema.
 * All child validators created via `for()` share the same `allErrors` and `extraErrors`.
 *
 * @template T  Shape of the form data.
 * @template TE Union of allowed keys for `extraErrors` (e.g. `'serverError' | 'globalError'`).
 *
 * @example
 * const vali = useValidator<MyForm, 'serverError'>(formData, validationSchema);
 * vali.extraErrors.serverError = 'Email již existuje';
 * delete vali.extraErrors.serverError;
 */
export const useValidator = <T extends object = object, TE extends string = string>(
	data: Ref<T>,
	schema: ObjectSchema<T>,
	options: Partial<ValidatorOptions> = {}
): Validator<T, TE> =>
	new Validator<T, TE>(
		data,
		schema,
		"",
		{
			yupErrors: ref({}),
			extraErrors: reactive<Partial<Record<TE, string>>>({}) as Partial<Record<TE, string>>,
			store: {},
			options: {
				inputErrorClass: "border-red-500 focus:border-red-500 bg-red-50 focus:bg-red-50 dark:bg-red-900/20",
				inputRequiredClass: null,
				...options,
			},
			errorMessageElements: {},
			touched: reactive<Record<string, boolean>>({}),
			submitted: ref(false),
		}
	);

export class Validator<T extends object = object, TE extends string = string> {
	// Per-field yup result (mutated by runValidation)
	private _yupErrorMessage: Ref<string | null> = ref(null);
	private _yupHasError: Ref<boolean> = ref(false);

	/** Current validation error message for this field (yup or extraErrors), or null if valid. */
	public errorMessage: ComputedRef<string | null>;
	/** True when this field currently has a validation error. */
	public hasError: ComputedRef<boolean>;
	/** True when this field is marked as required in the schema. */
	public required: Ref<boolean> = ref(false);

	/**
	 * Reactive object for programmatic errors shared across the validator tree.
	 * Add or remove keys to inject/clear errors that behave identically to yup errors
	 * (visible via `ErrorMessage`, counted in `allIsValid`, listed in `nestedErrorMessages`).
	 *
	 * @example
	 * vali.extraErrors.serverError = 'Email již existuje';
	 * delete vali.extraErrors.serverError;
	 */
	public extraErrors: Partial<Record<TE, string>>;

	/**
	 * Flat map of ALL errors (yup + extraErrors) across the entire validator tree.
	 * Keyed by field path. Read-only — mutate via `extraErrors` or let yup handle it.
	 */
	public allErrors: ComputedRef<Record<string, string>>;
	/** True when there are no errors in the entire validator tree. */
	public allIsValid: ComputedRef<boolean>;
	/**
	 * List of all current errors in the subtree rooted at this validator's path.
	 * Includes both yup errors and extraErrors.
	 */
	public nestedErrorMessages: ComputedRef<{ key: string; errorMessage: string }[]>;
	/** True when `nestedErrorMessages` is empty. */
	public nestedIsValid: ComputedRef<boolean>;
	/**
	 * Reactive object intended for `v-bind` on an input element.
	 * Automatically applies `inputErrorClass` when the field has an error.
	 */
	public inputBind = reactive<{ class: Record<string, boolean> }>({ class: {} });

	private errorMessageElements: Record<string, HTMLElement> = {};

	constructor(
		protected data: unknown,
		protected schema: ObjectSchema<T>,
		protected path: NestedPath<T>|"" = "",
		protected shared: ValidatorShared<TE>,
	) {
		this.extraErrors = shared.extraErrors;
		this.errorMessageElements = shared.errorMessageElements;

		this.allErrors = computed(() => ({
			...shared.yupErrors.value,
			...(shared.extraErrors as Record<string, string>),
		}));

		this.allIsValid = computed(() => Object
			.values(this.allErrors.value)
			.filter(val => !!val)
			.length === 0
		);

		this.errorMessage = computed(() =>
			this._yupErrorMessage.value
			?? (this.path ? (shared.extraErrors as Record<string, string>)[this.path] ?? null : null)
		);

		this.hasError = computed(() =>
			(this._yupHasError.value || (!!this.path && this.path in shared.extraErrors))
			&& (!!shared.touched[this.path] || shared.submitted.value)
		);

		this.nestedErrorMessages = computed(
			() => Object.entries(this.allErrors.value)
				.filter(([key]) => key.startsWith(this.path))
				.filter(([key]) => shared.touched[key] || shared.submitted.value)
				.map(([key, errorMessage]) => ({ key, errorMessage }))
		);

		this.nestedIsValid = computed(() => this.nestedErrorMessages.value.length === 0);

		const fieldInfo = this.getFieldInfo(path);
		this.required.value = fieldInfo.isRequired;
		this.inputBind.class[shared.options.inputRequiredClass ?? ""] = fieldInfo.isRequired;

		if (fieldInfo.hasTests) {
			let firstRun = true;
			watch(
				() => this.getValueByPath(unref(this.data) as object, this.path),
				() => {
					this.runValidation();
					if (!firstRun) shared.touched[this.path] = true;
					firstRun = false;
				},
				{ immediate: true, deep: true }
			);
		}

		watch(this.hasError, (val) => {
			this.inputBind.class[shared.options.inputErrorClass ?? ""] = val;
		}, { immediate: true });
	}

	/**
	 * Returns (or lazily creates) a child `Validator` for the given field path.
	 * All child validators share the same `allErrors`, `extraErrors`, and `store` as the root.
	 */
	public for<TV extends object = object>(path: NestedPath<T>, index: number|string|null = null): Validator<TV> {
		const fullPath = (this.path ? `${this.path}.` : "") + path + (index !== null ? `[${index}]` : "");
		if (!(fullPath in this.shared.store)) {
			this.shared.store[fullPath] = new Validator<TV>(
				this.data,
				this.schema as unknown as ObjectSchema<TV>,
				fullPath as NestedPath<TV>,
				this.shared as unknown as ValidatorShared<string>
			);
		}
		return this.shared.store[fullPath] as Validator<TV>;
	}

	private runValidation(): void {
		let isValid = false;
		try {
			this.schema.validateSyncAt(this.path, unref(this.data));
			this._yupErrorMessage.value = null;
			isValid = true;
		} catch (err: unknown) {
			if (err instanceof ValidationError) {
				this._yupErrorMessage.value = (err as { message: string }).message;
			} else {
				// path doesn't exist in schema (deleted row, etc.) — treat as valid
				isValid = true;
			}
		}
		this._yupHasError.value = !isValid;
		if (this.path) {
			if (!isValid) {
				this.shared.yupErrors.value[this.path] = this._yupErrorMessage.value!;
			} else {
				delete this.shared.yupErrors.value[this.path];
			}
		}
	}

	private getValueByPath(obj: object, path: string): unknown {
		if (!path) return obj;
		const parts = path.replace(/\[(\d+)\]/g, ".$1").split(".");
		return parts.reduce((acc: any, key) => (acc && acc[key] !== undefined ? acc[key] : undefined), obj);
	}

	protected getFieldInfo(path: string) {
		try {
			const subSchema = reach(this.schema, path);
			const description = subSchema.describe() as SchemaDescription;
			const isRequired = !description.nullable;
			const hasTests = description.tests.length > 0;
			return { exists: true, hasTests, isRequired };
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		} catch (err) {
			return { exists: false, hasTests: false, isRequired: false };
		}
	}

	public setErrorMessage(element: HTMLElement): void
	{
		this.errorMessageElements[this.path] = element;
	}

	/**
	 * Marks the whole validator tree as submitted — from this point on, all errors are shown
	 * regardless of whether the individual fields were touched. Call on a submit attempt.
	 *
	 * Also force-revalidates every field validator created so far. Each field's own watch (in the
	 * constructor) only re-runs runValidation() when THAT field's own value changes, so a yup
	 * `when()` rule keyed off a sibling field (e.g. "field B required only when field A is true")
	 * goes stale the moment the sibling changes without the dependent field itself changing —
	 * allIsValid would otherwise report a stale (often wrongly-valid) result right when
	 * markSubmitted() is used to gate a submit.
	 */
	public markSubmitted(): void
	{
		this.shared.submitted.value = true;
		this.runValidation();
		for (const validator of Object.values(this.shared.store)) validator?.runValidation();
	}

	/**
	 * Binds a computed/derived error (e.g. from a sub-component's own validation) to `extraErrors[key]`.
	 * Like a normal form field, the error stays hidden until the value actually changes for the first
	 * time (or the form is submitted) — this avoids showing errors derived from still-pristine data.
	 */
	/**
	 * Clears `touched`/`submitted` state for the whole tree, so a reused validator (e.g. on a
	 * persistent component whose form data gets reset) starts fresh instead of immediately
	 * re-showing errors left over from a previous submit attempt.
	 */
	public reset(): void
	{
		for (const key of Object.keys(this.shared.touched)) delete this.shared.touched[key];
		this.shared.submitted.value = false;
	}

	public bindExtraError<K extends TE>(key: K, getter: () => string | undefined): void
	{
		let first = true;
		watch(getter, val => {
			if (val === undefined) delete this.shared.extraErrors[key];
			else this.shared.extraErrors[key] = val;
			if (!first) this.shared.touched[key] = true;
			first = false;
		}, { immediate: true });
	}

	public toErrorMessage(path?: string): void
	{
		const key = path ?? this.path;
		const el = this.errorMessageElements[key];
		if (!el) return;
		el.scrollIntoView({ behavior: "smooth", block: "center" });
		setTimeout(() => {
			el.classList.remove("error-bounce");
			void el.offsetWidth;
			el.classList.add("error-bounce");
			el.addEventListener("animationend", () => el.classList.remove("error-bounce"), { once: true });
		}, 1000);
	}
}

/** Alias pro použití v komponentách (např. ErrorMessage). */
export type UseValidator = Validator;
