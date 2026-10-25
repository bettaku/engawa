import { readFileSync } from "node:fs";
import type { SchemaObject } from "ajv";
import _Ajv2020 from "ajv/dist/2020.js";
import * as yaml from "js-yaml";
import { github, owner, repo } from "./index.js";

// ajv ships CommonJS; `module.exports` is the class itself but its typings
// declare it as a namespace, so the constructor has to be recovered by hand.
const Ajv2020 = _Ajv2020 as unknown as typeof _Ajv2020.default;

type LabelsConfig = {
	labels: { name: string; color: string; description?: string }[];
};

function loadLabelsConfig(): LabelsConfig {
	const workspace = process.env.GITHUB_WORKSPACE ?? ".";
	const labelsFilePath = `${workspace}/.github/labels.yml`;
	const schemaFilePath = `${workspace}/.github/labels-schema.json`;

	const config: unknown = yaml.load(readFileSync(labelsFilePath, "utf8"));
	const schema: SchemaObject = JSON.parse(readFileSync(schemaFilePath, "utf8"));

	const ajv = new Ajv2020({ allErrors: true });
	const validate = ajv.compile(schema);

	if (!validate(config)) {
		console.error(`Invalid label configuration in ${labelsFilePath}:`);
		for (const error of validate.errors ?? []) {
			console.error(`  ${error.instancePath || "/"} ${error.message}`);
		}
		process.exit(1);
	}

	return config as LabelsConfig;
}

async function updateLabels() {
	// Validate the whole configuration before touching the GitHub API, so a
	// malformed file can never leave the labels half-updated.
	const config = loadLabelsConfig();

	const existingLabels = await github.paginate(
		github.rest.issues.listLabelsForRepo,
		{
			owner,
			repo,
		},
	);

	const existingLabelNames = existingLabels.map((label) => label.name.toLowerCase());

	for (const label of config.labels) {
		if (!existingLabelNames.includes(label.name.toLowerCase())) {
			await github.rest.issues.createLabel({
				owner,
				repo,
				name: label.name,
				color: label.color,
				description: label.description,
			});
		} else {
			try {
				await github.rest.issues.updateLabel({
					owner,
					repo,
					name: label.name,
					color: label.color,
					description: label.description,
				});
			} catch (error: any) {
				if (error?.response?.data?.errors?.some((e: any) => e.code === "already_exists")) {
					await github.rest.issues.updateLabel({
						owner,
						repo,
						name: label.name,
						color: label.color,
						description: label.description,
					});
					continue;
				}
				throw error;
			}
		}
	}
}

updateLabels().catch((error) => {
	console.error("Error updating labels:", error);
	process.exit(1);
});
