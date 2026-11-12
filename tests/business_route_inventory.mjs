// Phase 10.5G: syntax-tree route inventory for authorization contract checks.
// Not a replacement for object-level business authorization tests.
import fs from 'node:fs';
import ts from 'typescript';
export const publicApi=new Set([
  'GET /api/health','GET /api/auth/status',
  'POST /api/auth/setup','POST /api/auth/login',
  'POST /api/telegram/webhook'
]);
export function discoverRoutes(filename) {
  const source=ts.createSourceFile(filename,fs.readFileSync(filename,'utf8'),
    ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
  const routes=[];
  function walk(n) {
    if(ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) &&
       n.expression.expression.getText(source)==='app' &&
       ['get','post','put','patch','delete'].includes(n.expression.name.text)){
      const v=n.arguments[0];
      if(v && (ts.isStringLiteral(v)||ts.isNoSubstitutionTemplateLiteral(v)) &&
         v.text.startsWith('/api/')){
        const middle=n.arguments.slice(1);
        const auth=middle.some(x=>ts.isIdentifier(x)&&x.text==='requireAuth');
        let roles=null;
        for(const x of middle){
          if(ts.isCallExpression(x) && ts.isIdentifier(x.expression)&&
            x.expression.text==='requireRole'){
            roles=x.arguments.map(y=>ts.isStringLiteral(y)?y.text:'<nonliteral>');
          }
        }
        routes.push({method:n.expression.name.text.toUpperCase(),
          path:v.text,auth,roles,line:source.getLineAndCharacterOfPosition(n.getStart(source)).line+1});
      }
    }
    ts.forEachChild(n,walk);
  }
  walk(source);
  return routes;
}
export const pathForSmoke=p=>p.replace(/:[A-Za-z_]\w*/g,'isolated-nonexistent-object');
