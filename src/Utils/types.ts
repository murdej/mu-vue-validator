export type NestedPath<T> = T extends object
	? {
		[K in keyof T]-?: K extends string
			? T[K] extends object
				? `${K}` | `${K}.${NestedPath<T[K]>}`
				: `${K}`
			: never;
	}[keyof T]
	: never;
