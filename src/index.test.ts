export { __tests__ as sub } from "./sub";


Object.keys(exports).forEach(k => describe(k, () => {
    exports[k]();
}));
