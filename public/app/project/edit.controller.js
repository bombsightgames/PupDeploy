angular.module('app').controller('ProjectEditController', function($rootScope, $location, growl, $routeParams, UserService) {
    var vm = this,
        id = $routeParams.id;

    vm.id = id;

    vm.addStep = function() {
        vm.project.steps.push({
            commands: ''
        });
    };

    vm.removeStep = function(index) {
        if (vm.project.steps[index].commands === '' || confirm('Are you sure you want to remove this step?')) {
            vm.project.steps.splice(index, 1);
        }
    };

    vm.save = function() {
        UserService.socket.emit('project_update', vm.project, function(err) {
            if (err) {
                growl.error(err);
            } else {
                if (id) {
                    growl.success('Project updated successfully.');
                } else {
                    growl.success('Project created successfully.');
                }

                $location.path('/projects');
            }
        });
    };

    vm.loading = true;
    if (id){
        UserService.socket.emit('project_get', id, function(err, project) {
            if (err) {
                growl.error(err);
                $location.path('/projects');
            } else {
                vm.project = project;
            }

            vm.loading = false;
            $rootScope.$apply();
        });
    } else {
        vm.project = {
            name: '',
            steps: [],
            auth: {
                type: 'password'
            }
        };
        vm.addStep();

        vm.loading = false;
    }
});