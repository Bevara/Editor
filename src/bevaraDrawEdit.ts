/**
 * Define the type of edits used in bevara draw files.
 */
export interface BevaraDrawEdit {
	readonly color: string;
	readonly stroke: ReadonlyArray<[number, number]>;
}