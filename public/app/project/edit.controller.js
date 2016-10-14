angular.module('app').controller('ProjectEditController', function($rootScope, $location, growl, UserService) {
    var vm = this;

    vm.data = {
        name: '',
        steps: []
    };

    vm.addStep = function() {
        vm.data.steps.push(            {
            commands: ''
        });
    };

    vm.save = function() {
        UserService.socket.emit('project_update', vm.data, function(err) {
            if (err) {
                growl.error(err);
            } else {
                growl.success('Project created successfully.');
                $location.path('/projects');
            }
        });
    };

    vm.addStep();
});