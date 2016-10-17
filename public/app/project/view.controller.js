angular.module('app').controller('ProjectViewController', function($scope, $location, growl, $routeParams, UserService) {
    var vm = this,
        id = $routeParams.id;

    vm.id = id;
    vm.loading = true;
    vm.project = {};
    vm.logs = null;
    UserService.socket.emit('project_get', id, function(err, project) {
        if (err) {
            growl.error(err);
            $location.path('/projects');
        } else {
            vm.project = project;
        }

        vm.loading = false;
        $scope.$apply();
    });

    vm.runProject = function() {
        vm.logs = {};

        UserService.socket.emit('project_run', id, function(err) {
            if (err) {
                growl.error(err);
            } else {
                addNextStep(0);
            }
        });
    };

    vm.editProject = function() {
        $location.path('/projects/edit/' + id);
    };

    $scope.$on('socket:step_run', function(event, data) {
        data.output += '\n';

        if (vm.logs[data.index] ) {
            vm.logs[data.index].output += data.output;
        } else {
            vm.logs[data.index] = data;
        }

        $scope.$apply();
    });

    function addNextStep(index) {
        var nextStep = vm.project.steps[index];
        if (nextStep) {
            vm.logs[index] = {
                project: vm.project._id,
                index: index,
                step: nextStep,
                output: '',
                type: 'out'
            };
        }
    }

    $scope.$on('socket:step_end', function(event, data) {
        if (vm.logs[data.index] ) {
            vm.logs[data.index].code = data.code;
        } else {
            vm.logs[data.index] = data;
        }

        addNextStep(data.index+1);
        
        $scope.$apply();
    });

    $scope.$on('socket:project_status', function(event, data) {
        if (data.project == id) {
            vm.project.status = data.status;
            vm.project.error = data.error;

            if (data.error) {
                vm.logs = null;
            }

            $scope.$apply();
        }
    });
});
