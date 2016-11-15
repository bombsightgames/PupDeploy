angular.module('app').controller('ProjectLogsController', function($scope, $location, growl, $routeParams, UserService) {
    var vm = this,
        id = $routeParams.id;

    vm.id = id;
    vm.loading = true;
    vm.project = {};
    vm.logs = null;
    vm.serverIndex = 0;
    UserService.socket.emit('project_get', id, function(err, project) {
        if (err) {
            growl.error(err);
            $location.path('/projects');
        } else {
            vm.project = project;
            UserService.socket.emit('project_logs', id, function(err, logs) {
                if (err) {
                    growl.error(err);
                    $location.path('/projects');
                } else {
                    vm.logs = logs;
                    vm.loading = false;
                    $scope.$apply();
                }
            });
        }
    });
});
