
import * as fs from 'fs';
import * as CMake from 'peg-cmake';

function pathExists(p: string): boolean {
	try {
		fs.accessSync(p);
	} catch (err) {
		return false;
	}

	return true;
}

export function getCMakeFromUri(uri: string) {
	const cmakepath = uri + "/CMakeLists.txt";
	if (!pathExists(cmakepath)) {
		return null;
	}
	const data = fs.readFileSync(cmakepath, 'utf8');
	return CMake.parse(data);
}

export function getFilterNameFromCMake(ast: any) {
	const filternode = ast.find((astNode: any) => astNode && astNode.type == 'command_invocation' &&
		astNode.identifier && astNode.identifier.value == 'add_filter');

	if (!filternode){
		return null;
	}
	const first_argument = filternode.arguments.find((x :any)=> x.type != 'newline');
	return filternode.arguments[0].value;
}

export function getFilterVersionFromCMake(ast: any) {
	const filternode = ast.find((astNode: any) => astNode && astNode.type == 'command_invocation' &&
		astNode.identifier && astNode.identifier.value == 'add_filter');

	if (!filternode){
		return null;
	}

	const filter_arguments = filternode.arguments.filter((x:any) => x.type != 'newline');
	return filter_arguments[7].value;
}

export function getOutputFromCmake(uri: string){
	const cmake = getCMakeFromUri(uri);
	const name = getFilterNameFromCMake(cmake);
	const version = getFilterVersionFromCMake(cmake);
	return name +"_"+version+".wasm";
}

export function getJSONNameFromCmake(uri: string){
	const cmake = getCMakeFromUri(uri);
	const name = getFilterNameFromCMake(cmake);
	const version = getFilterVersionFromCMake(cmake);
	return name +"_"+version+".json";
}



export function filterDescFromFilterName(uri: string, filterName:string){
	const descpath = uri + "/"+filterName + ".json";

	if (!pathExists(descpath)){
		return null;
	}

	return JSON.parse(fs.readFileSync(descpath, 'utf-8'));
}

export function getFilterDesc(uri: string){
	const ast = getCMakeFromUri(uri);
	const filterName = getFilterNameFromCMake(ast);
	if (!filterName){
		return null;
	}
	return filterDescFromFilterName(uri, filterName);

}