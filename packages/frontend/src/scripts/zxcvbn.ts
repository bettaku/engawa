import { zxcvbn, zxcvbnOptions, OptionsType } from "@zxcvbn-ts/core";
import * as zxcvbnCommonPackage from "@zxcvbn-ts/language-common";
import * as zxcvbnEnPackage from "@zxcvbn-ts/language-en";
import * as zxcvbnJaPackage from "@zxcvbn-ts/language-ja";
import { matcherPwnedFactory } from "@zxcvbn-ts/matcher-pwned";

const options: OptionsType = {
	translations: zxcvbnJaPackage.translations,
	graphs: zxcvbnCommonPackage.adjacencyGraphs,
	dictionary: {
		...zxcvbnEnPackage.dictionary,
		...zxcvbnJaPackage.dictionary,
		...zxcvbnCommonPackage.dictionary,
	},
	useLevenshteinDistance: true,
}

zxcvbnOptions.setOptions(options);

export const zxcvbnScore = (password: string) => {
	return zxcvbn(password).score;
};


