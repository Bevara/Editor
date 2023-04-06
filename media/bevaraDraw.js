let global_editor = null;
let server_url = "http://bevara.ddns.net/accessors/";

// This script is run within the webview itself
(function () {
	// @ts-ignore
	const vscode = acquireVsCodeApi();

	class BevaraDrawEditor {
		constructor( /** @type {HTMLElement} */ preview,
		/** @type {HTMLElement} */ fragment,
		/** @type {HTMLElement} */ untitled
		) {

			this._preview = preview;
			this._fragment = fragment;
			this._untitled = untitled;
			this._supported = "";
			this._tag = "";
			this._mime = "";
			this._core = "";
			this._decoders = "";
			this._url = "";
			this._uri = "";
			this._scripts = {};
			this._scriptsDirectory = "";
			this._data = null;
			this.artplayer = false;
			this.kind = "";
			this._useCache = false;
			this._noWorker = false;
			this._showProgess = false;
			this._outFormat = null;
			this._workerScript = null;
		}

		initUntitled() {
			this._untitled.style.display = "block";
		}

		async setData(uri, data, scripts, scriptsDirectory) {
			if (scriptsDirectory != "") {
				server_url = scriptsDirectory;
			}

			const response = await fetch(server_url + 'recommended.json')
			const recommended = await response.json();
			const ext = uri.split('.').pop()?.toLowerCase();
			this._mime = recommended.mimeTypes[ext];
			if (ext in recommended.using) {
				this._core = recommended.using[ext];
				this._decoders = null;
			} else if (ext in recommended.with) {
				this._core = "core";
				this._decoders = recommended.with[ext];
			} else {
				this._core = "core";
				const fallback = await fetch(server_url + 'filter_list.json');
				const fallback_json = await fallback.json();
				this._decoders = fallback_json["with"].join(";");
			}


			this._uri = uri;
			this._data = data;
			this._scripts = scripts;
			this._scriptsDirectory = scriptsDirectory;

			const blob = new Blob([data], { 'type': this._mime });
			this._url = URL.createObjectURL(blob);
			if (this._mime) {
				updateButtons(this._mime.split('/')[0], this._core, this._decoders);
				this.updateTag();
			}
		}

		get tag() {
			let preview = `<${this._tag.tag} src="${this._url}" print="#output" printerr="#output" script-directory="${this._scriptsDirectory}" controls connections `;
			let text = `<${this._tag.tag} src="${this._uri}" script-directory="${this._scriptsDirectory}" `;

			if (this._core) {
				//preview += ` using="${this._noWorker ? this._core : this._workerScript}"`;
				preview += ` using="${this._core}"`;
				text += ` using="${this._core}"`;
			}

			if (this._decoders) {
				preview += ` with="${this._decoders}"`;
				text += ` with="${this._decoders}"`;
			}

			if (this._useCache) {
				preview += ` use-cache `;
				text += ` use-cache `;
			}

			if (this._noWorker) {
				preview += ` no-worker `;
				text += ` no-worker `;
			}

			if (this._showProgess) {
				preview += ` progress `;
				text += ` progress `;
			}

			if (this._outFormat) {
				preview += ` out="${this._outFormat}" `;
				text += `out="${this._outFormat}" `;
			}

			preview += `>`;
			text += `>`;


			return {
				preview: preview,
				text: text,
			};
		}

		async getBevaraData() {
			function getWasm(x) {
				return new Promise((resolve) => {
					fetch(server_url + x)
						.then((response) => response.arrayBuffer())
						.then((data) => {
							resolve({ name: x, data: data });
						});
				})
			}


			const decoders = this._decoders? await Promise.all(this._decoders
				.split(';')
				.map(x => getWasm(x))) : [];
			const core = await getWasm(this._core + ".wasm");
			const js = await getWasm(this._core + ".js");

			return { supported: this._supported, uri: this._uri, source: this._data, js: js, core: core, with: decoders };
		}

		set tag(tag) {
			this._tag = tag;
		}

		set supported(tag) {
			this._supported = tag;
		}

		set core(core) {
			this._core = core;
		}

		set decoders(decoders) {
			this._decoders = decoders;
		}

		set useCache(useCache) {
			this._useCache = useCache;
			this.updateTag();
		}

		set noWorker(noWorker) {
			this._noWorker = noWorker;
			this.updateTag();
		}

		set outFormat(outFormat) {
			this._outFormat = outFormat;
			this.updateTag();
		}

		set showProgess(showProgess) {
			this._showProgess = showProgess;
			this.updateTag();
		}

		async updateTag() {
			if (this._scriptsDirectory == "") return;

			// if (this._core && !this._noWorker) {
			// 	const response = await fetch(this._scriptsDirectory + "/" + this._core + ".js");
			// 	const blob = await response.blob();
			// 	this._workerScript = URL.createObjectURL(blob);
			// }

			this._preview.innerHTML = this.tag.preview;
			this._fragment.value = this.tag.text;

			if (this.kind == "canvas") {
				this._preview.innerHTML += "</canvas>";
				this._fragment.value += "</canvas>";
			}

			if (this.artplayer) {

				this._fragment.value = '<div class="artplayer-app" style="width:400px;height:300px">' + this._fragment.value + '</div>';
				this._preview.innerHTML = '<div class="artplayer-app" style="width:400px;height:300px">' + this._preview.innerHTML + '</div>';

				var artplayer_script = document.createElement('script');
				artplayer_script.setAttribute('src', this._scripts["artplayer"]);
				artplayer_script.addEventListener('load', () => {
					var art = new Artplayer({
						container: '.artplayer-app',
					});
				});

				this._preview.appendChild(artplayer_script);

				this._fragment.value += `
<script src="artplayer.js"></script>
<script>
	var art = new Artplayer({
		container: '.artplayer-app',
	});

</script>`;

			}


			if (this._scripts[this.kind]) {
				var universal_script = document.createElement('script');
				universal_script.setAttribute('src', this._scripts[this.kind]);
				this._preview.appendChild(universal_script);

				this._fragment.value += `<script src="${this._scripts[this.kind]}"></script>`;
			}
		}

		async preserve() {
			vscode.postMessage({ type: 'save' });
		}
	}

	const editor = new BevaraDrawEditor(
		document.querySelector('.drawing-preview'),
		document.querySelector('#htmlTag'),
		document.querySelector('.select-source')
	);

	// Handle messages from the extension
	window.addEventListener('message', async e => {
		const { type, body, requestId } = e.data;
		switch (type) {
			case 'init':
				{
					if (body.untitled) {
						editor.initUntitled();
					} else {
						await editor.setData(body.uri.path, body.value, body.scripts, body.scriptsDirectory);
					}

					return;
				}
			case 'getFileData':
				{
					const bevaraData = await editor.getBevaraData();
					vscode.postMessage({ type: 'response', requestId, body: bevaraData });
					return;
				}
		}
	});


	// Signal to VS Code that the webview is initialized.
	vscode.postMessage({ type: 'ready' });

	global_editor = editor;
}());

const tags = {
	"image": {
		tag: "img is='universal-img'"
	},
	"audio": {
		tag: "audio is='universal-audio'"
	},
	"video": {
		tag: "video is='universal-video'"
	},
	"canvas": {
		tag: "canvas is='universal-canvas' id='canvas'"
	},
	"canvas with artplayer": {
		tag: "canvas is='universal-canvas' id='canvas' class='art-video' oncontextmenu='event.preventDefault()'"
	}
}

const usings = ["core", "jp2", "jxl"];

function preserveFile() {
	global_editor.preserve();
}

let accessors = null;

fetch(server_url + 'filter_list.json')
	.then((response) => response.json())
	.then((data) => {
		initButtons(data);
	});

function initButtons(data) {

	const tag_buttons = document.querySelector('.tag-buttons');
	const using_buttons = document.querySelector('.using-buttons');

	let tag_button = "";
	for (let tag in tags) {
		tag_button += `<input type="checkbox" onClick="toggleTag(this)" name="Tag" value="${tag}" id="${tag}"> 
		<label for="${tag}" class="md-chip md-chip-clickable md-chip-hover">${tag}</label>`;
	}
	tag_buttons.innerHTML = tag_button;

	let tag_using = "";
	
	for (let using of usings) {
			tag_using += `<input type="checkbox" onClick="toggleUsing(this)" name="Using" value="${using}" id="${using}"> 
				<label for="${using}" class="md-chip md-chip-clickable md-chip-hover">${using}</label>`;
	}
	
	using_buttons.innerHTML = tag_using;


	const with_buttons = document.querySelector('.with-buttons');
	let with_button = "";
	for (let with_wasm of data.with) {
		with_button += `<input type="checkbox" onClick="toggleWith(this)" name="With" value="${with_wasm}" id="${with_wasm}"> 
		<label for="${with_wasm}" class="md-chip md-chip-clickable md-chip-hover">${with_wasm.split('.')[0]}</label>`;
	}
	with_buttons.innerHTML = with_button;
	global_editor.updateTag();
}

function updateButtons(tag, core, decoders) {
	let checkboxes = document.getElementsByName('Tag');
	for (var i = 0, n = checkboxes.length; i < n; i++) {
		checkboxes[i].checked = checkboxes[i].id == tag;
		if (checkboxes[i].id == tag) {
			global_editor.kind = tag;
			global_editor.tag = tags[checkboxes[i].value];
		}
	}

	global_editor.supported = tag;

	checkboxes = document.getElementsByName('Using');
	for (var i = 0, n = checkboxes.length; i < n; i++) {
		checkboxes[i].checked = checkboxes[i].id == core;
	}

	/*checkboxes = document.getElementsByName('Using');
	for (var i = 0, n = checkboxes.length; i < n; i++) {
		checkboxes[i].checked = checkboxes[i].id == core;
	}*/

	if (decoders) {
		checkboxes = document.getElementsByName('With');
		const all_with = decoders.split(';');
		for (var i = 0, n = checkboxes.length; i < n; i++) {
			checkboxes[i].checked = all_with.includes(checkboxes[i].id);
		}
	}
}

function toggleTag(source) {
	const tags = document.getElementsByName('Tag');
	for (var i = 0, n = tags.length; i < n; i++) {
		tags[i].checked = tags[i] == source;
	}

	const decoder_list = document.getElementById("decoder_list");

	global_editor.artplayer = false;

	if (source.id == "canvas") {
		decoder_list.hidden = true;
		global_editor.decoders = null;
		global_editor.kind = source.id;
	} else if (source.id == "canvas with artplayer") {
		decoder_list.hidden = true;
		global_editor.decoders = null;
		global_editor.decoders = null;
		global_editor.artplayer = true;
		global_editor.kind = "canvas";
	} else {
		decoder_list.hidden = false;
		global_editor.kind = source.id;
	}

	global_editor.tag = source.value;

	//FIXME
	setCore(source.value);
	global_editor.updateTag();
}

function toggleUsing(source) {
	const usings = document.getElementsByName('Using');
	for (var i = 0, n = usings.length; i < n; i++) {
		usings[i].checked = usings[i] == source;
	}

	global_editor.core = source.id;
	global_editor.updateTag();
}

function toggleWith(source) {
	allWith = [];

	const withs = document.getElementsByName('With');
	for (var i = 0, n = withs.length; i < n; i++) {
		if (withs[i].checked) allWith.push(withs[i].value);
	}

	global_editor.decoders = allWith.join(';');
	global_editor.updateTag();
}

function toggleUseCache(source) {
	global_editor.useCache = source.checked;
}

function toggleNoWorker(source) {
	global_editor.noWorker = source.checked;
}


function toggleShowProgess(source) {
	global_editor.showProgess = source.checked;
}

function toggleOUT(source) {
	const ouformats = document.getElementsByName('ouformat');
	for (var i = 0, n = ouformats.length; i < n; i++) {
		ouformats[i].checked = ouformats[i] == source;
	}

	global_editor.outFormat = source.id;
}

function toggleAllWith(source) {
	checkboxes = document.getElementsByName('With');
	for (var i = 0, n = checkboxes.length; i < n; i++) {
		checkboxes[i].checked = source.checked;
	}

	toggleWith();
}

function copyTag() {
	// Get the text field
	var copyText = document.getElementById("htmlTag");

	// Select the text field
	copyText.select();
	copyText.setSelectionRange(0, 99999); // For mobile devices

	// Copy the text inside the text field
	navigator.clipboard.writeText(copyText.value);
}

function fileLoaded(input) {
	const file = input.files[0];
	var reader = new FileReader();

	reader.onload = function (e) {
		global_editor.setData(file.path, e.target.result);
	}
	reader.readAsArrayBuffer(file);
}