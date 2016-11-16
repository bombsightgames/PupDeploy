angular.module('app').controller('ProjectViewController', function($scope, $location, growl, $routeParams, UserService) {
    var vm = this,
        id = $routeParams.id;

    vm.id = id;
    vm.loading = true;
    vm.project = {};
    vm.logs = null;
    vm.log = null;
    vm.serverIndex = 0;
    UserService.socket.emit('project_get', id, function(err, project) {
        if (err) {
            growl.error(err);
            $location.path('/projects');
        } else {
            vm.project = project;
            UserService.socket.emit('project_log', {projectId: id, execution: project.executions}, function(err, log) {
                if (err) {
                    growl.error(err);
                    $location.path('/projects');
                } else {
                    if (log) {
                        vm.log = log;
                        vm.logs = log.logs;
                    }

                    vm.loading = false;
                    $scope.$apply();
                }
            });
        }
    });

    vm.runProject = function() {
        vm.log = null;
        vm.logs = {};

        vm.serverIndex = 0;
        UserService.socket.emit('project_run', id, function(err) {
            if (err) {
                growl.error(err);
            }
        });
    };

    $scope.$on('socket:step_run', function(event, data) {
        data.output += '\n';

        var server = vm.logs[data.server.index];
        if (server) {
            if (server.logs[data.index] ) {
                server.logs[data.index].output += data.output;
            } else {
                server.logs[data.index] = data;
            }
        } else {
            server = data.server;
            server.logs = {};
            server.logs[data.index] = data;
        }

        vm.logs[server.index] = server;
        if (Object.keys(server.logs).length >= vm.project.steps.length) {
            vm.serverIndex++;
        }
        $scope.$apply();
    });

    function addNextStep(index) {
        if (index >= vm.project.steps.length) {
            index = 0;
        }

        var nextStep = vm.project.steps[index];
        if (nextStep && vm.serverIndex <= vm.project.servers.length-1) {
            if (!vm.logs[vm.serverIndex]) {
                vm.logs[vm.serverIndex] = {
                    index: vm.serverIndex,
                    host: vm.project.servers[vm.serverIndex].host,
                    logs: {}
                };
            }

            vm.logs[vm.serverIndex].logs[index] = {
                project: vm.project._id,
                index: index,
                step: vm.project.steps[index],
                output: '',
                type: 'out'
            };
        }
    }

    $scope.$on('socket:step_end', function(event, data) {
        if (vm.logs[data.server.index] ) {
            vm.logs[data.server.index].logs[data.index].code = data.code;
        } else {
            vm.logs[data.server.index] = data.server;
            vm.logs[data.server.index].logs = {};
            vm.logs[data.server.index].logs[data.index] = data;
        }

        if (data.code == 0 || !vm.project.settings.haltOnFailure) {
            addNextStep(data.index + 1);
        }
        $scope.$apply();
    });

    $scope.$on('socket:project_status', function(event, data) {
        if (data.project == id) {
            if (data.status === 'running') {
                vm.logs = {};
                addNextStep(0);
            }

            vm.project.status = data.status;
            vm.project.error = data.error;

            $scope.$apply();
        }
    });
});
