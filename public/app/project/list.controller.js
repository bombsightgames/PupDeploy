angular.module('app').controller('ProjectListController', function($scope, UserService) {
    var vm = this;

    UserService.socket.emit('project_list', {}, function(err, projects) {
        if (err) {
            growl.error(err);
        } else {
            vm.projects = projects;
            $scope.$apply();
        }
    });
});