import * as yaml from "js-yaml";
import { readFileSync } from "node:fs";
import { github, owner, repo } from "./index.js";

async function updateLabels() {
	const existingLabels = await github.paginate(
		github.rest.issues.listLabelsForRepo,
		{
			owner,
			repo,
		},
	);

	const existingLabelNames = existingLabels.map((label) => label.name);

	const labelsFilePath = process.env.GITHUB_WORKSPACE ? `${process.env.GITHUB_WORKSPACE}/.github/labels.yml` : ".github/labels.yml";
	const labelsData = readFileSync(labelsFilePath, "utf8");
	const labels = yaml.load(labelsData) as {
		labels: { name: string; color: string; description?: string }[];
	};

	for (const label of labels.labels) {
		if (!existingLabelNames.includes(label.name)) {
			await github.rest.issues.createLabel({
				owner,
				repo,
				name: label.name,
				color: label.color,
				description: label.description,
			});
		} else {
			await github.rest.issues.updateLabel({
				owner,
				repo,
				name: label.name,
				color: label.color,
				description: label.description,
			});
		}
	}
}

updateLabels().catch((error) => {
	console.error("Error updating labels:", error);
	process.exit(1);
});

