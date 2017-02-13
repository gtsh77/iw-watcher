module.exports = function (grunt) {
    grunt.initConfig({
            watch: {
                // app: {
                //  files: ['js/components/*.ts'],
                //  tasks: ['ts'
                //   //,'closureCompiler:connect'
                //  ]
                // }
                appFrontWatch: {
                    files: ['app/**/*ts'],
                    tasks: ['ts']
                }
            },
            ts: {
              base: {
                options: {
                  module: 'system', 
                  moduleResolution: 'node',
                  target: 'es5',
                  experimentalDecorators: true,
                  emitDecoratorMetadata: true,
                  noImplicitAny: false
                },
                src: ['app/**/*.ts']
              }
            }                                                             
            }
    );
    grunt.loadNpmTasks('grunt-contrib-watch');
    grunt.loadNpmTasks("grunt-ts");
    // grunt.registerTask('dev', [ 'copy:dev', 'compass:appFront', 'string-replace:appTemplates']);
    // grunt.registerTask('build', [ 'teamcity', 'ts:base', 'compass:appFrontProd', 'string-replace:appTemplates' ,'copy:prod', 'systemjs', 'import', 'closureCompiler:app']);
    //grunt.registerTask('production', [ 'import', 'compass:connectFrontProd', 'string-replace:one', 'closureCompiler:connect']);
};