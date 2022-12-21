let global_editor = null;

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
			this._tag = "";
			this._mime = "";
			this._core = "";
			this._decoders = "";
			this._url = "";
			this._uri = "";
			this._data = null;
		}

		initUntitled() {
			this._untitled.style.display = "block";
		}

		async setData(uri, data) {

			const response = await fetch('http://bevara.ddns.net/accessors/recommended.json')
			const recommended = await response.json();
			const ext = uri.split('.').pop();
			this._tag = recommended.tag[ext];
			this._mime = recommended.mimeTypes[ext];
			this._core = recommended.core[ext];
			this._decoders = recommended.with[ext];

			this._uri = uri;
			const blob = new Blob([data], { 'type': this._mime });
			this._url = URL.createObjectURL(blob);
			updateButtons(this._tag, this._core, this._decoders);
			this.updateTag();

		}

		get tag() {
			return {
				preview: `<${this._tag} src="${this._url}" using="${this._core}" with="${this._decoders}" printerr="#output" controls connections>`,
				text: `<${this._tag} src="${this._uri}" using="${this._core}" with="${this._decoders}">`,
			};
		}

		getBevData() {
			let data = this._data;
			return new Promise(function (resolve) {
				resolve(data);
			});
		}

		set tag(tag) {
			this._tag = tag;
			this.updateTag();
		}

		set core(core) {
			this._core = core;
			this.updateTag();
		}

		set decoders(decoders) {
			this._decoders = decoders;
			this.updateTag();
		}

		async updateTag() {
			this._preview.innerHTML = this.tag.preview;
			this._fragment.value = this.tag.text;
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
						await editor.setData(body.uri.path, body.value);
					}

					return;
				}
			case 'getFileData':
				{
					// Get the image data for the canvas and post it back to the extension.
					editor.getBevData().then(data => {
						vscode.postMessage({ type: 'response', requestId, body: Array.from(data) });
					});
					return;
				}
		}
	});


	// Signal to VS Code that the webview is initialized.
	vscode.postMessage({ type: 'ready' });

	global_editor = editor;
}());

let accessors = null;

fetch('http://bevara.ddns.net/accessors/filter_list.json')
	.then((response) => response.json())
	.then((data) => {
		initButtons(data);
	});

function initButtons(data) {

	const tag_buttons = document.querySelector('.tag-buttons');

	let tag_button = "";
	for (let tag of data.tag) {
		tag_button += `<input type="checkbox" onClick="toggleTag(this)" name="Tag" value="${tag}" id="${tag}"> 
		<label for="${tag}" class="md-chip md-chip-clickable md-chip-hover">${tag}</label>`;
	}
	tag_buttons.innerHTML = tag_button;

	const using_buttons = document.querySelector('.using-buttons');
	let using_button = "";
	for (let using_wasm of data.using) {
		using_button += `<input type="checkbox" onClick="toggleUsing(this)" name="Using" value="${using_wasm}" id="${using_wasm}"> 
		<label for="${using_wasm}" class="md-chip md-chip-clickable md-chip-hover">${using_wasm.split('.')[0]}</label>`;
	}
	using_buttons.innerHTML = using_button;

	const with_buttons = document.querySelector('.with-buttons');
	let with_button = "";
	for (let with_wasm of data.with) {
		with_button += `<input type="checkbox" onClick="toggleWith(this)" name="With" value="${with_wasm}" id="${with_wasm}"> 
		<label for="${with_wasm}" class="md-chip md-chip-clickable md-chip-hover">${with_wasm.split('.')[0]}</label>`;
	}
	with_buttons.innerHTML = with_button;
}

function updateButtons(tag, core, decoders) {
	let checkboxes = document.getElementsByName('Tag');
	for (var i = 0, n = checkboxes.length; i < n; i++) {
		checkboxes[i].checked = checkboxes[i].id == tag;
	}

	checkboxes = document.getElementsByName('Using');
	for (var i = 0, n = checkboxes.length; i < n; i++) {
		checkboxes[i].checked = checkboxes[i].id == core;
	}

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

	global_editor.tag = source.id;
}

function toggleUsing(source) {
	const usings = document.getElementsByName('Using');
	for (var i = 0, n = usings.length; i < n; i++) {
		usings[i].checked = usings[i] == source;
	}

	global_editor.using = source.id;
}

function toggleWith(source) {
	allWith = [];

	const withs = document.getElementsByName('With');
	for (var i = 0, n = withs.length; i < n; i++) {
		if (withs[i].checked) allWith.push(withs[i].value);
	}

	global_editor.decoders = allWith.join(';');
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