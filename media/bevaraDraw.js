let global_editor = null;
const server_url = "http://bevara.ddns.net/accessors/";

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
			this._data = null;
			this.artplayer = false;
			this.kind = "";
			this._useCache=false;
		}

		initUntitled() {
			this._untitled.style.display = "block";
		}

		async setData(uri, data, scripts) {

			const response = await fetch(server_url + 'recommended.json')
			const recommended = await response.json();
			const ext = uri.split('.').pop()?.toLowerCase();
			this._mime = recommended.mimeTypes[ext];
			this._decoders = recommended.with[ext];
			if (!this._decoders) {
				const fallback = await fetch(server_url + 'filter_list.json');
				const fallback_json = await fallback.json();
				this._decoders = fallback_json["with"].join(";");
			}


			this._uri = uri;
			this._data = data;
			this._scripts = scripts;

			const blob = new Blob([data], { 'type': this._mime });
			this._url = URL.createObjectURL(blob);
			if (this._mime) {
				updateButtons(this._mime.split('/')[0], this._decoders);
				this.updateTag();
			}
		}

		get tag() {
			let preview = `<${this._tag} src="${this._url}" print="#output" printerr="#output" controls connections`;
			let text = `<${this._tag} src="${this._uri}"`;
			if (this._decoders) {
				preview += ` with="${this._decoders}"`;
				text += ` with="${this._decoders}"`;
			}

			if (this._useCache) {
				preview += ` use-cache`;
				text += ` use-cache`;
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


			const decoders = await Promise.all(this._decoders
				.split(';')
				.map(x => getWasm(x)));
			const core = await getWasm(this._core);

			return { supported: this._supported, uri: this._uri, source: this._data, core: core, with: decoders };
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

		async updateTag() {
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
						await editor.setData(body.uri.path, body.value, body.scripts);
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
	"image": "img is='universal-img' using='core-img.wasm' ",
	"audio": "audio is='universal-audio' using='core-audio.wasm' ",
	"video": "video is='universal-video' using='core-video.wasm' ",
	"canvas": "canvas is='universal-canvas' id='canvas'",
	"canvas with artplayer": "canvas is='universal-canvas' id='canvas' class='art-video' oncontextmenu='event.preventDefault()'"
}

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

	let tag_button = "";
	for (let tag in tags) {
		tag_button += `<input type="checkbox" onClick="toggleTag(this)" name="Tag" value="${tags[tag]}" id="${tag}"> 
		<label for="${tag}" class="md-chip md-chip-clickable md-chip-hover">${tag}</label>`;
	}
	tag_buttons.innerHTML = tag_button;
	/*
		const using_buttons = document.querySelector('.using-buttons');
		let using_button = "";
		for (let using_wasm of data.using) {
			using_button += `<input type="checkbox" onClick="toggleUsing(this)" name="Using" value="${using_wasm}" id="${using_wasm}"> 
			<label for="${using_wasm}" class="md-chip md-chip-clickable md-chip-hover">${using_wasm.split('.')[0]}</label>`;
		}
		using_buttons.innerHTML = using_button;*/

	const with_buttons = document.querySelector('.with-buttons');
	let with_button = "";
	for (let with_wasm of data.with) {
		with_button += `<input type="checkbox" onClick="toggleWith(this)" name="With" value="${with_wasm}" id="${with_wasm}"> 
		<label for="${with_wasm}" class="md-chip md-chip-clickable md-chip-hover">${with_wasm.split('.')[0]}</label>`;
	}
	with_buttons.innerHTML = with_button;
	global_editor.updateTag();
}

function setCore(tag) {

	global_editor.supported = tag;

	//FIXME
	switch (tag) {
		case 'image':
			global_editor.core = "core-img.wasm";
			break;
		case 'audio':
			global_editor.core = "core-audio.wasm";
			break;
		case 'video':
			global_editor.core = "core-video.wasm";
			break;
	}
}

function updateButtons(tag, decoders) {
	let checkboxes = document.getElementsByName('Tag');
	for (var i = 0, n = checkboxes.length; i < n; i++) {
		checkboxes[i].checked = checkboxes[i].id == tag;
		if (checkboxes[i].id == tag) {
			global_editor.kind = tag;
			global_editor.tag = checkboxes[i].value;
		}
	}

	//FIXME
	setCore(tag);

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

	global_editor.using = source.id;
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

function toggleUseCache(source){
	global_editor.useCache = source.checked;
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