import resolve from 'rollup-plugin-node-resolve'
import babel from 'rollup-plugin-babel'
import json from 'rollup-plugin-json'

import pkg from './package.json'

export default {
    input: 'src/index.mjs',
    output: [
        {
            file: pkg.main,
            name: 'Booru',
            format: 'cjs'
        },
        {
            file: pkg.module,
            name: 'Booru',
            format: 'es'
        }
    ],
    plugins: [
        resolve(),
        json(),
        babel({
            exclude: 'node_modules/**'
        })
    ],
    external: ['path', 'xml2js', 'node-fetch']
}
