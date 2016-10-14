angular.module('app').controller('LoginController', function($scope, UserService) {
    $scope.onSubmit = function() {
        UserService.login($scope.user.username, $scope.user.password);
    };
});

