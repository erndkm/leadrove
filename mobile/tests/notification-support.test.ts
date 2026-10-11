/// <reference types="node" />
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

function execute(file:string,modules:Record<string,unknown>) {
  const code=ts.transpileModule(readFileSync(new URL(file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
  const module={exports:{}};
  new Function('require','module','exports',code)((name:string)=>{if(!(name in modules))throw new Error(`Disallowed module import: ${name}`);return modules[name];},module,module.exports);
  return module.exports as {notificationsSupported:()=>boolean};
}
test('global notification registration skips every Android Expo Go identification path',()=>{
  for(const constants of [{appOwnership:'expo',executionEnvironment:'storeClient'},{appOwnership:null,executionEnvironment:'storeClient'},{appOwnership:'expo',executionEnvironment:undefined}]) {
    const support=execute('../src/services/notification-support.ts',{'react-native':{Platform:{OS:'android'}},'expo-constants':{__esModule:true,default:constants,ExecutionEnvironment:{StoreClient:'storeClient'}}});
    assert.equal(support.notificationsSupported(),false);
    // expo-notifications is intentionally absent: importing it would fail.
    execute('../src/services/notification-handler.ts',{'./notification-support':support});
  }
});
test('installed Android build registers the global notification handler',()=>{
  const support=execute('../src/services/notification-support.ts',{'react-native':{Platform:{OS:'android'}},'expo-constants':{__esModule:true,default:{appOwnership:null,executionEnvironment:'bare'},ExecutionEnvironment:{StoreClient:'storeClient'}}});
  assert.equal(support.notificationsSupported(),true);
  let registered=false;
  execute('../src/services/notification-handler.ts',{'./notification-support':support,'expo-notifications':{setNotificationHandler:()=>{registered=true;}}});
  assert.equal(registered,true);
});
