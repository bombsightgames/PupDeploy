angular.module('app').controller('ProjectLogController', function($scope, $location, growl, $routeParams, UserService) {
    var vm = this,
        id = $routeParams.id,
        execution = $routeParams.execution;

    vm.id = id;
    vm.loading = true;
    vm.project = {};
    vm.log = null;
    vm.logs = null;
    UserService.socket.emit('project_get', id, function(err, project) {
        if (err) {
            growl.error(err);
            $location.path('/projects/view/' + id + '/logs');
        } else {
            vm.project = project;
            UserService.socket.emit('project_log', {projectId: id, execution: parseInt(execution)}, function(err, log) {
                if (err) {
                    growl.error(err);
                    $location.path('/projects/view/' + id + '/logs');
                } else {
                    if (log) {
                        vm.log = log;
                        vm.logs = vm.log.logs;
                        vm.loading = false;
                        $scope.$apply();
                    } else {
                        growl.error('Execution log not found.');
                        $location.path('/projects/view/' + id + '/logs');
                    }
                }
            });
        }
    });
});
