angular.module('app').controller('LoginController', function($scope, UserService) {
    var vm = this;
    vm.loading = false;

    $scope.onSubmit = function() {
        vm.loading = true;
        UserService.login($scope.user.username, $scope.user.password).then(function() {
            vm.loading = false;
        }, function() {
            vm.loading = false;
        });
    };
});

