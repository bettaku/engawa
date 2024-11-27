/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from "@nestjs/common";
import { DI } from "@/di-symbols.js";
import type { NoteReferencedRepository } from "@/models/_.js";
import type { } from "@/models/Blocking.js";
import type { MiUser } from "@/models/User.js";
import type { MiNoteReferenced } from "@/models/NoteReferenced.js";
import { bindThis } from "@/decorators.js";
import { IdService } from "@/core/IdService.js";
import { NoteEntityService } from "./NoteEntityService.js";

@Injectable()
export class NoteReferenceEntityService {
	constructor()
}
